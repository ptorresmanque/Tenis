// Prueba deploy/htaccess.qa y deploy/htaccess.prod contra un Apache de verdad: el de
// macOS (2.4.67) es casi el del servidor (2.4.68). Donde no hay Apache con estos módulos,
// como en el runner de GitHub, se salta; ahí lo cubre la verificación de D4.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';

const MODULOS = '/usr/libexec/apache2';
const hayApache =
  existsSync('/usr/sbin/httpd') && existsSync(join(MODULOS, 'mod_rewrite.so'));
const saltar = hayApache ? false : 'no hay un Apache con mod_rewrite en esta máquina';

function escribir(ruta, contenido = '') {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, contenido);
}

function puertoLibre() {
  return new Promise((listo) => {
    const servidor = createServer().listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => listo(port));
    });
  });
}

/** Un document root como el que deja el agente, servido por Apache con el .htaccess. */
async function apache(ambiente) {
  const dir = mkdtempSync(join(tmpdir(), `htaccess-${ambiente}-`));
  const docroot = join(dir, 'docroot');
  escribir(join(docroot, 'index.html'), 'SPA');
  escribir(join(docroot, 'chunk-A.js'), 'js');
  escribir(join(docroot, 'reservar/index.html'), 'prerender');
  escribir(join(docroot, 'media/logo.svg'), 'svg');
  escribir(join(docroot, '.well-known/acme-challenge/token'), 'token');
  // En el servidor, /api lo atiende Passenger. Acá basta un archivo para ver que la SPA
  // no se lo queda.
  escribir(join(docroot, 'api/salud'), 'api');
  escribir(join(docroot, 'api/yo'), 'null');
  escribir(join(docroot, 'api/torneos/fotos/1/imagen'), 'jpg');

  const passwd = join(dir, 'passwd');
  execFileSync('htpasswd', ['-cbB', passwd, 'fedal', 'clave']);
  const htaccess = readFileSync(new URL(`./htaccess.${ambiente}`, import.meta.url), 'utf8');
  escribir(
    join(docroot, '.htaccess'),
    htaccess.replace(/AuthUserFile ".*"/, `AuthUserFile "${passwd}"`),
  );

  // HTTP y HTTPS, como el servidor: la redirección y la clave dependen de %{HTTPS}.
  execFileSync('openssl', [
    'req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '1', '-subj', '/CN=qa.fedal.cl',
    '-keyout', join(dir, 'clave.pem'), '-out', join(dir, 'certificado.pem'),
  ], { stdio: 'ignore' });
  const http = await puertoLibre();
  const https = await puertoLibre();
  const modulos = [
    'mpm_prefork', 'unixd', 'authn_core', 'authn_file', 'authz_core', 'authz_user',
    'auth_basic', 'autoindex', 'dir', 'mime', 'headers', 'expires', 'rewrite', 'socache_shmcb',
    'ssl',
  ];
  const conf = join(dir, 'httpd.conf');
  writeFileSync(
    conf,
    [
      `ServerRoot "/usr"`,
      `Listen 127.0.0.1:${http}`,
      `Listen 127.0.0.1:${https}`,
      ...modulos.map((m) => `LoadModule ${m}_module ${MODULOS}/mod_${m}.so`),
      `ServerName localhost`,
      `PidFile "${dir}/httpd.pid"`,
      // Con dos puertos, Apache crea un mutex: que sea aquí y no en /var/run.
      `DefaultRuntimeDir "${dir}"`,
      `ErrorLog "${dir}/error.log"`,
      `DocumentRoot "${docroot}"`,
      `DirectoryIndex index.html`,
      // Como la configuración global del servidor (D4, 2026-10-06), que ningún .htaccess
      // de la cuenta pide: las páginas salen con 7 días de caché y /api/yo, medido con
      // curl, con un mes (mod_expires: Cache-Control y Expires).
      `Header set Cache-Control "max-age=604800, must-revalidate"`,
      `ExpiresActive On`,
      `ExpiresDefault "access plus 1 month"`,
      `<Directory "${docroot}">`,
      // Como un hosting que lista carpetas por defecto: solo el .htaccess lo impide.
      `  Options Indexes SymLinksIfOwnerMatch`,
      `  AllowOverride All`,
      `  Require all granted`,
      `</Directory>`,
      `<VirtualHost 127.0.0.1:${https}>`,
      `  SSLEngine on`,
      `  SSLCertificateFile "${dir}/certificado.pem"`,
      `  SSLCertificateKeyFile "${dir}/clave.pem"`,
      `</VirtualHost>`,
    ].join('\n'),
  );

  const proceso = spawn('/usr/sbin/httpd', ['-X', '-f', conf]);
  const urls = { http: `http://127.0.0.1:${http}`, https: `https://127.0.0.1:${https}` };
  for (let intento = 0; intento < 50; intento += 1) {
    try {
      execFileSync('curl', ['-sk', '-o', '/dev/null', urls.https]);
      break;
    } catch {
      await new Promise((listo) => setTimeout(listo, 100));
    }
  }
  return { urls, cerrar: () => proceso.kill() };
}

/** GET con curl, que sí deja fijar el Host. Por HTTPS, salvo que se pida HTTP. */
function pedir(urls, ruta, { host, clave = false, protocolo = 'https' } = {}) {
  const args = ['-sk', '-i', '-H', `Host: ${host}`];
  if (clave) args.push('-u', 'fedal:clave');
  const salida = execFileSync('curl', [...args, `${urls[protocolo]}${ruta}`], {
    encoding: 'utf8',
  });
  const [cabecera, ...cuerpo] = salida.split('\r\n\r\n');
  return {
    estado: Number(cabecera.split(' ')[1]),
    cabecera: cabecera.toLowerCase(),
    cuerpo: cuerpo.join('\r\n\r\n'),
  };
}

describe('htaccess.qa', { skip: saltar }, () => {
  let servidor;
  const qa = (ruta, opciones = {}) =>
    pedir(servidor.urls, ruta, { host: 'qa.fedal.cl', clave: true, ...opciones });

  test('levanta Apache', async () => {
    servidor = await apache('qa');
  });
  after(() => servidor?.cerrar());

  test('sin la clave de QA responde 401', () => {
    assert.equal(qa('/', { clave: false }).estado, 401);
  });

  test('con la clave sirve la SPA, sin caché para index.html y con noindex', () => {
    const respuesta = qa('/');
    assert.equal(respuesta.cuerpo, 'SPA');
    assert.match(respuesta.cabecera, /cache-control: no-cache/);
    assert.match(respuesta.cabecera, /x-robots-tag: noindex, nofollow/);
  });

  test('una ruta de la SPA sin archivo carga index.html', () => {
    assert.equal(qa('/socio/reservas').cuerpo, 'SPA');
  });

  test('los archivos y las rutas prerenderizadas se sirven tal cual', () => {
    assert.equal(qa('/chunk-A.js').cuerpo, 'js');
    assert.equal(qa('/reservar/').cuerpo, 'prerender');
  });

  test('/api no pasa por la SPA', () => {
    assert.equal(qa('/api/salud').cuerpo, 'api');
  });

  test('la API no queda en caché, aunque el servidor le ponga un mes', () => {
    const respuesta = qa('/api/yo');
    assert.match(respuesta.cabecera, /cache-control: no-store/);
    assert.doesNotMatch(respuesta.cabecera, /max-age=/);
    assert.doesNotMatch(respuesta.cabecera, /^expires:/m);
  });

  test('las fotos de los torneos y los chunks sí quedan en caché', () => {
    assert.match(qa('/api/torneos/fotos/1/imagen').cabecera, /max-age=604800/);
    assert.match(qa('/chunk-A.js').cabecera, /max-age=604800/);
  });

  test('/.well-known/ responde sin clave, para que AutoSSL renueve', () => {
    const respuesta = qa('/.well-known/acme-challenge/token', { clave: false });
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo, 'token');
  });

  test('pedido con otro nombre (fedal.cl/qa.fedal.cl/) responde 403', () => {
    assert.equal(qa('/', { host: 'fedal.cl' }).estado, 403);
  });

  test('una carpeta sin index.html no se lista', () => {
    assert.equal(qa('/media/').estado, 403);
  });

  test('por HTTP redirige a HTTPS antes de pedir la clave, que no viaja en claro', () => {
    const respuesta = qa('/socio/reservas', { clave: false, protocolo: 'http' });
    assert.equal(respuesta.estado, 301);
    assert.match(respuesta.cabecera, /location: https:\/\/qa\.fedal\.cl\/socio\/reservas/);
    assert.doesNotMatch(respuesta.cabecera, /www-authenticate/);
  });

  test('por HTTP, /api también redirige', () => {
    assert.equal(qa('/api/salud', { clave: false, protocolo: 'http' }).estado, 301);
  });

  test('por HTTP, /.well-known/ responde sin redirigir, para AutoSSL', () => {
    const respuesta = qa('/.well-known/acme-challenge/token', {
      clave: false,
      protocolo: 'http',
    });
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo, 'token');
  });
});

describe('htaccess.prod', { skip: saltar }, () => {
  let servidor;
  const prod = (ruta, opciones = {}) =>
    pedir(servidor.urls, ruta, { host: 'fedal.cl', ...opciones });

  test('levanta Apache', async () => {
    servidor = await apache('prod');
  });
  after(() => servidor?.cerrar());

  test('sirve la SPA sin clave y sin noindex', () => {
    const respuesta = prod('/');
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo, 'SPA');
    assert.match(respuesta.cabecera, /cache-control: no-cache/);
    assert.doesNotMatch(respuesta.cabecera, /x-robots-tag/);
  });

  test('una ruta de la SPA sin archivo carga index.html', () => {
    assert.equal(prod('/socio/reservas').cuerpo, 'SPA');
  });

  test('/api no pasa por la SPA', () => {
    assert.equal(prod('/api/salud').cuerpo, 'api');
  });

  test('la API no queda en caché, aunque el servidor le ponga un mes', () => {
    const respuesta = prod('/api/yo');
    assert.match(respuesta.cabecera, /cache-control: no-store/);
    assert.doesNotMatch(respuesta.cabecera, /max-age=/);
    assert.doesNotMatch(respuesta.cabecera, /^expires:/m);
  });

  test('una carpeta sin index.html no se lista', () => {
    assert.equal(prod('/media/').estado, 403);
  });

  test('por HTTP redirige a HTTPS', () => {
    const respuesta = prod('/socio/reservas', { protocolo: 'http' });
    assert.equal(respuesta.estado, 301);
    assert.match(respuesta.cabecera, /location: https:\/\/fedal\.cl\/socio\/reservas/);
  });

  test('por HTTP, /.well-known/ responde sin redirigir, para AutoSSL', () => {
    assert.equal(prod('/.well-known/acme-challenge/token', { protocolo: 'http' }).cuerpo, 'token');
  });
});
