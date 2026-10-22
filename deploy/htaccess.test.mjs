// Prueba deploy/htaccess.qa y deploy/htaccess.prod contra un Apache de verdad: el de
// macOS (2.4.67) es casi el del servidor (2.4.68). Donde no hay Apache con estos módulos,
// como en el runner de GitHub, se salta; ahí lo cubre la verificación de D4.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
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
  // Como lo deja el build con prerender (T360): la portada y El club salen como HTML, y lo que
  // se dibuja en el navegador carga index.csr.html.
  escribir(join(docroot, 'index.html'), 'portada');
  escribir(join(docroot, 'index.csr.html'), 'SPA');
  // Con hash en el nombre, como los deja el build: 8 caracteres que pueden traer _ y -.
  escribir(join(docroot, 'chunk-Ab1_x-9Z.js'), 'js');
  escribir(join(docroot, 'main-F3MQA22C.js'), 'main');
  escribir(join(docroot, 'styles-6AQ7DO47.css'), 'css');
  escribir(join(docroot, 'media/barlow-400-MHMWYSEE.woff2'), 'fuente');
  // Sin hash: se reemplazan con el mismo nombre.
  escribir(join(docroot, 'fotos/portada-1080.webp'), 'foto');
  escribir(join(docroot, 'og.jpg'), 'og');
  escribir(join(docroot, 'el-club/index.html'), 'prerender');
  escribir(join(docroot, 'media/logo.svg'), 'svg');
  escribir(join(docroot, 'robots.txt'), 'robots');
  escribir(join(docroot, 'sitemap.xml'), 'sitemap');
  escribir(join(docroot, '.well-known/acme-challenge/token'), 'token');
  // En el servidor, /api lo atiende Passenger. Acá basta un archivo para ver que la SPA
  // no se lo queda.
  escribir(join(docroot, 'api/salud'), 'api');
  escribir(join(docroot, 'api/yo'), 'null');
  // Una redirección generada después del .htaccess, como la de /api/auth/google en
  // Passenger. Hecha con mod_rewrite, porque en el servidor real mod_expires sí les pone
  // encabezados a esas (la 301 a HTTPS de QA los traía); un Redirect de la configuración
  // del servidor llega antes del .htaccess y un CGI arma sus encabezados por otro camino.
  escribir(
    join(docroot, 'api/auth/.htaccess'),
    'RewriteEngine On\nRewriteRule ^google$ https://accounts.google.com/ [R=302,L]\n',
  );
  escribir(join(docroot, 'api/torneos/fotos/1/imagen'), 'jpg');

  escribir(
    join(docroot, '.htaccess'),
    readFileSync(new URL(`./htaccess.${ambiente}`, import.meta.url), 'utf8'),
  );

  // HTTP y HTTPS, como el servidor: la redirección depende de %{HTTPS}.
  execFileSync('openssl', [
    'req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '1', '-subj', '/CN=qa.fedal.cl',
    '-keyout', join(dir, 'clave.pem'), '-out', join(dir, 'certificado.pem'),
  ], { stdio: 'ignore' });
  const http = await puertoLibre();
  const https = await puertoLibre();
  const modulos = [
    'mpm_prefork', 'unixd', 'authn_core', 'authn_file', 'authz_core', 'authz_user',
    'auth_basic', 'autoindex', 'dir', 'mime', 'headers', 'expires', 'rewrite',
    'socache_shmcb',
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
function pedir(urls, ruta, { host, protocolo = 'https' } = {}) {
  const args = ['-sk', '-i', '-H', `Host: ${host}`];
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
    pedir(servidor.urls, ruta, { host: 'qa.fedal.cl', ...opciones });

  test('levanta Apache', async () => {
    servidor = await apache('qa');
  });
  after(() => servidor?.cerrar());

  test('**QA se abre sin clave** (2026-10-09, a pedido del usuario)', () => {
    const respuesta = qa('/');
    assert.equal(respuesta.estado, 200);
    assert.doesNotMatch(respuesta.cabecera, /www-authenticate/);
  });

  test('sirve la portada prerenderizada, sin caché y con noindex', () => {
    // Abierto, pero fuera de los buscadores: no es el sitio del club.
    const respuesta = qa('/');
    assert.equal(respuesta.cuerpo, 'portada');
    assert.match(respuesta.cabecera, /cache-control: no-cache/);
    assert.match(respuesta.cabecera, /x-robots-tag: noindex, nofollow/);
  });

  // T361: con el prerender, index.html es la portada; lo del navegador carga index.csr.html.
  test('**una ruta de la SPA sin archivo carga index.csr.html, sin caché**', () => {
    const respuesta = qa('/socio/reservas');
    assert.equal(respuesta.cuerpo, 'SPA');
    assert.match(respuesta.cabecera, /cache-control: no-cache/);
  });

  test('**una ruta prerenderizada se sirve sin barra final y sin redirigir**', () => {
    const respuesta = qa('/el-club');
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo, 'prerender');
    assert.match(respuesta.cabecera, /cache-control: no-cache/);
  });

  test('con barra final redirige a la URL sin barra: una sola URL por página', () => {
    const respuesta = qa('/el-club/');
    assert.equal(respuesta.estado, 301);
    assert.match(respuesta.cabecera, /location: https:\/\/qa\.fedal\.cl\/el-club\r?\n/);
  });

  test('los archivos se sirven tal cual', () => {
    assert.equal(qa('/chunk-Ab1_x-9Z.js').cuerpo, 'js');
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

  test('tampoco quedan en caché una redirección ni un error de la API', () => {
    for (const ruta of ['/api/auth/google', '/api/no-existe']) {
      const respuesta = qa(ruta);
      assert.doesNotMatch(respuesta.cabecera, /max-age=[1-9]/, ruta);
      assert.doesNotMatch(respuesta.cabecera, /^expires:/m, ruta);
    }
  });

  test('las fotos de los torneos sí quedan en caché', () => {
    assert.match(qa('/api/torneos/fotos/1/imagen').cabecera, /max-age=604800/);
  });

  // T367 (SPEC-seo.md T8): un archivo con hash no cambia nunca; el release nuevo trae otro nombre.
  test('**lo que lleva hash queda un año, sin volver a preguntar**', () => {
    for (const ruta of ['/chunk-Ab1_x-9Z.js', '/main-F3MQA22C.js', '/styles-6AQ7DO47.css', '/media/barlow-400-MHMWYSEE.woff2']) {
      const cabecera = qa(ruta).cabecera;
      assert.match(cabecera, /cache-control: public, max-age=31536000, immutable\r?\n/, ruta);
      assert.doesNotMatch(cabecera, /max-age=604800/, ruta);
    }
  });

  test('lo que no lleva hash no queda un año: una foto se reemplaza con el mismo nombre', () => {
    for (const ruta of ['/fotos/portada-1080.webp', '/og.jpg', '/robots.txt', '/', '/socio/reservas', '/media/logo.svg']) {
      assert.doesNotMatch(qa(ruta).cabecera, /immutable|max-age=31536000/, ruta);
    }
  });

  test('/.well-known/ responde, para que AutoSSL renueve', () => {
    const respuesta = qa('/.well-known/acme-challenge/token');
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo, 'token');
  });

  test('pedido con otro nombre (fedal.cl/qa.fedal.cl/) responde 403', () => {
    assert.equal(qa('/', { host: 'fedal.cl' }).estado, 403);
  });

  test('una carpeta sin index.html no se lista', () => {
    assert.doesNotMatch(qa('/media').cuerpo, /Index of|logo\.svg/);
  });

  test('por HTTP redirige a HTTPS', () => {
    const respuesta = qa('/socio/reservas', { protocolo: 'http' });
    assert.equal(respuesta.estado, 301);
    assert.match(respuesta.cabecera, /location: https:\/\/qa\.fedal\.cl\/socio\/reservas/);
    assert.doesNotMatch(respuesta.cabecera, /www-authenticate/);
  });

  test('por HTTP, /api también redirige', () => {
    assert.equal(qa('/api/salud', { protocolo: 'http' }).estado, 301);
  });

  test('por HTTP, /.well-known/ responde sin redirigir, para AutoSSL', () => {
    const respuesta = qa('/.well-known/acme-challenge/token', { protocolo: 'http' });
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

  test('sirve la portada prerenderizada sin clave y sin noindex', () => {
    const respuesta = prod('/');
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo, 'portada');
    assert.match(respuesta.cabecera, /cache-control: no-cache/);
    assert.doesNotMatch(respuesta.cabecera, /x-robots-tag/);
  });

  test('**una ruta de la SPA sin archivo carga index.csr.html, sin caché**', () => {
    const respuesta = prod('/socio/reservas');
    assert.equal(respuesta.cuerpo, 'SPA');
    assert.match(respuesta.cabecera, /cache-control: no-cache/);
  });

  test('una URL que no existe también carga index.csr.html: la SPA dice «No encontrada»', () => {
    assert.equal(prod('/no-existe').cuerpo, 'SPA');
  });

  test('**una ruta prerenderizada se sirve sin barra final y sin redirigir**', () => {
    const respuesta = prod('/el-club');
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo, 'prerender');
    assert.match(respuesta.cabecera, /cache-control: no-cache/);
  });

  test('con barra final redirige a la URL sin barra, con la consulta', () => {
    const respuesta = prod('/el-club/?a=1');
    assert.equal(respuesta.estado, 301);
    assert.match(respuesta.cabecera, /location: https:\/\/fedal\.cl\/el-club\?a=1\r?\n/);
  });

  // Antes de T352 no existían, y los buscadores recibían la SPA con un 200 (SPEC-seo.md).
  test('robots.txt y sitemap.xml se sirven como archivo, no como la SPA', () => {
    assert.equal(prod('/robots.txt').cuerpo, 'robots');
    assert.equal(prod('/sitemap.xml').cuerpo, 'sitemap');
  });

  test('**lo que lleva hash queda un año, sin volver a preguntar**', () => {
    for (const ruta of ['/chunk-Ab1_x-9Z.js', '/main-F3MQA22C.js', '/styles-6AQ7DO47.css', '/media/barlow-400-MHMWYSEE.woff2']) {
      const cabecera = prod(ruta).cabecera;
      assert.match(cabecera, /cache-control: public, max-age=31536000, immutable\r?\n/, ruta);
      assert.doesNotMatch(cabecera, /max-age=604800/, ruta);
    }
  });

  test('lo que no lleva hash no queda un año', () => {
    for (const ruta of ['/fotos/portada-1080.webp', '/og.jpg', '/robots.txt', '/', '/el-club', '/socio/reservas', '/media/logo.svg']) {
      assert.doesNotMatch(prod(ruta).cabecera, /immutable|max-age=31536000/, ruta);
    }
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
    assert.doesNotMatch(prod('/media').cuerpo, /Index of|logo\.svg/);
  });

  test('por HTTP redirige a HTTPS', () => {
    const respuesta = prod('/socio/reservas', { protocolo: 'http' });
    assert.equal(respuesta.estado, 301);
    assert.match(respuesta.cabecera, /location: https:\/\/fedal\.cl\/socio\/reservas/);
  });

  test('por HTTP, /.well-known/ responde sin redirigir, para AutoSSL', () => {
    assert.equal(prod('/.well-known/acme-challenge/token', { protocolo: 'http' }).cuerpo, 'token');
  });

  // La sesión es del nombre en que se inició, y Google y Webpay vuelven a fedal.cl: quien
  // entrara por www no podría entrar con Google y, después de pagar, aparecería sin sesión.
  test('**www.fedal.cl redirige a fedal.cl**, con la ruta y la consulta', () => {
    const respuesta = prod('/torneos?cuadro=5', { host: 'www.fedal.cl' });
    assert.equal(respuesta.estado, 301);
    assert.match(respuesta.cabecera, /location: https:\/\/fedal\.cl\/torneos\?cuadro=5\r?\n/);
  });

  test('por HTTP, www llega a https://fedal.cl en un solo salto', () => {
    const respuesta = prod('/socio/reservas', { host: 'www.fedal.cl', protocolo: 'http' });
    assert.equal(respuesta.estado, 301);
    assert.match(respuesta.cabecera, /location: https:\/\/fedal\.cl\/socio\/reservas\r?\n/);
  });

  test('en www, /.well-known/ responde sin redirigir, para que AutoSSL valide ese nombre', () => {
    const opciones = { host: 'www.fedal.cl', protocolo: 'http' };
    assert.equal(prod('/.well-known/acme-challenge/token', opciones).cuerpo, 'token');
  });
});
