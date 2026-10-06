// Test de deploy/agente.sh contra un servidor falso armado en un HOME temporal.
// npm, mysqldump y curl son falsos: el test prueba la orquestación (candado, sha256,
// activación, vuelta atrás, manifiesto, estado). Los comandos de verdad se prueban
// en la corrida de integración de D2 y en el servidor en D4.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const AGENTE = new URL('./agente.sh', import.meta.url).pathname;
const CLAVE_DE_LA_BASE = 'clave-de-la-base';

function escribir(ruta, contenido = '') {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, contenido);
}

/** Un HOME como el de fedalcl el día del primer despliegue, después de la Fase 0. */
function servidor() {
  const home = mkdtempSync(join(tmpdir(), 'agente-'));
  const base = join(home, 'fedal/qa');
  const docroot = join(home, 'public_html/qa.fedal.cl');

  escribir(
    join(base, '.env'),
    `DATABASE_URL="mysql://fedalqa:${CLAVE_DE_LA_BASE}@127.0.0.1:3306/fedal_qa"\n`,
  );
  escribir(join(base, 'subidas/torneos/foto.jpg'), 'foto');
  mkdirSync(join(base, 'entrante'));
  // El archivo de prueba que crea el Selector: current es una carpeta, no un symlink.
  escribir(join(base, 'current/apps/api/dist/main.js'), 'It works!');
  escribir(join(docroot, 'api/.htaccess'), 'PassengerAppRoot');
  escribir(join(docroot, 'ajeno.txt'), 'lo puso alguien a mano');

  const bin = join(home, 'bin');
  const falso = (nombre, cuerpo) => {
    escribir(join(bin, nombre), `#!/bin/sh\n${cuerpo}\n`);
    chmodSync(join(bin, nombre), 0o755);
  };
  falso(
    'npm',
    `echo "npm $*" >> "$HOME/npm.log"
case "$*" in
  ci*) [ "$FALLA_EN" = ci ] && exit 1; mkdir -p node_modules ;;
  *migrate*) [ "$FALLA_EN" = migrate ] && exit 1 ;;
  *arranque*) [ -n "$ADMIN_INICIAL" ] && cp "$ADMIN_INICIAL" "$HOME/arranque-recibio" ;;
esac
exit 0`,
  );
  falso('mysqldump', 'echo "-- dump $*"');
  falso('curl', '[ -f "$HOME/salud-falla" ] && exit 22; echo \'{"estado":"ok"}\'');

  return { home, base, docroot, bin };
}

/** Deja en entrante/ un release como el que sube GitHub Actions (D1). */
function subirRelease(srv, sha, { web = { 'index.html': sha }, suma } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'release-'));
  for (const [ruta, contenido] of Object.entries(web)) {
    escribir(join(dir, 'web', ruta), contenido);
  }
  escribir(join(dir, 'apps/api/package.json'), '{}');
  escribir(join(dir, 'deploy/agente.sh'), `# agente del release ${sha}`);
  escribir(join(dir, 'deploy/htaccess.qa'), `# htaccess del release ${sha}`);

  const archivo = join(srv.base, `entrante/release-${sha}.tar.gz`);
  execFileSync('tar', ['-czf', archivo, '-C', dir, '.']);
  const real = createHash('sha256').update(readFileSync(archivo)).digest('hex');
  writeFileSync(join(srv.base, 'entrante/listo'), `${sha} ${suma ?? real}\n`);
}

function correr(srv, env = {}) {
  return spawnSync('bash', [AGENTE, 'qa'], {
    encoding: 'utf8',
    env: {
      HOME: srv.home,
      PATH: `${srv.bin}:${process.env.PATH}`,
      AGENTE_ESPERA_REINICIO: '0',
      AGENTE_URL_SALUD: 'https://qa.test/api/salud',
      ...env,
    },
  });
}

const estado = (srv) => readFileSync(join(srv.base, 'entrante/estado'), 'utf8');
/** El sha del release activo: cada intento se instala en releases/<sha>.<sufijo>. */
const activo = (srv) =>
  readlinkSync(join(srv.base, 'current')).replace(/^releases\/([^.]+)\..*$/, '$1');
const enDocroot = (srv, ruta) => join(srv.docroot, ruta);

test('sin "listo" no hace nada', () => {
  const srv = servidor();

  const resultado = correr(srv);

  assert.equal(resultado.status, 0);
  assert.equal(existsSync(join(srv.base, 'entrante/estado')), false);
  assert.equal(existsSync(join(srv.base, 'logs')), false);
});

test('un release nuevo queda activo, con la web publicada y estado ok', () => {
  const srv = servidor();
  subirRelease(srv, 'a1a1a1a1', {
    web: { 'index.html': 'A', 'reservar/index.html': 'A' },
  });

  const resultado = correr(srv);

  assert.equal(resultado.status, 0, resultado.stderr);
  assert.equal(estado(srv), 'a1a1a1a1 ok\n');
  assert.equal(activo(srv), 'a1a1a1a1');
  assert.equal(
    readlinkSync(join(srv.base, 'current/apps/api/.env')),
    join(srv.base, '.env'),
  );
  assert.equal(readFileSync(enDocroot(srv, 'index.html'), 'utf8'), 'A');
  assert.equal(readFileSync(enDocroot(srv, 'reservar/index.html'), 'utf8'), 'A');
  assert.equal(
    readFileSync(enDocroot(srv, '.htaccess'), 'utf8'),
    '# htaccess del release a1a1a1a1',
  );
  assert.ok(existsSync(join(srv.base, 'tmp/restart.txt')));
  assert.equal(existsSync(join(srv.base, 'entrante/listo')), false);
  assert.equal(
    existsSync(join(srv.base, 'entrante/release-a1a1a1a1.tar.gz')),
    false,
  );
});

test('el archivo de prueba del Selector queda como release al que volver', () => {
  const srv = servidor();
  subirRelease(srv, 'a1a1a1a1');

  correr(srv);

  assert.equal(
    readFileSync(join(srv.base, 'releases/inicial/apps/api/dist/main.js'), 'utf8'),
    'It works!',
  );
});

test('si /api/salud falla, el release anterior sigue activo y estado dice error', () => {
  const srv = servidor();
  subirRelease(srv, 'a1a1a1a1', { web: { 'index.html': 'A', 'solo-a.js': 'A' } });
  correr(srv);
  subirRelease(srv, 'b2b2b2b2', { web: { 'index.html': 'B', 'solo-b.js': 'B' } });
  writeFileSync(join(srv.home, 'salud-falla'), '');

  const resultado = correr(srv);

  assert.notEqual(resultado.status, 0);
  assert.equal(activo(srv), 'a1a1a1a1');
  assert.match(estado(srv), /^b2b2b2b2 error\n/);
  assert.match(estado(srv), /salud/);
  assert.equal(readFileSync(enDocroot(srv, 'index.html'), 'utf8'), 'A');
  assert.ok(existsSync(enDocroot(srv, 'solo-a.js')));
  assert.equal(existsSync(enDocroot(srv, 'solo-b.js')), false);
  assert.equal(existsSync(join(srv.base, 'entrante/listo')), false);
});

test('un archivo que llegó incompleto (sha256 distinto) no se instala', () => {
  const srv = servidor();
  subirRelease(srv, 'a1a1a1a1', { suma: 'f'.repeat(64) });

  const resultado = correr(srv);

  assert.notEqual(resultado.status, 0);
  assert.match(estado(srv), /^a1a1a1a1 error\n/);
  assert.match(estado(srv), /sha256/);
  assert.equal(existsSync(join(srv.base, 'releases')), false);
  assert.equal(existsSync(join(srv.base, 'entrante/listo')), false);
});

test('un "listo" con un sha que no es hexadecimal no toca nada fuera de entrante/', () => {
  const srv = servidor();
  escribir(join(srv.base, 'entrante/listo'), `../../x ${'f'.repeat(64)}\n`);

  const resultado = correr(srv);

  assert.notEqual(resultado.status, 0);
  assert.match(estado(srv), /^listo-invalido error\n/);
  assert.equal(existsSync(join(srv.base, 'releases')), false);
});

test('sin el .env del ambiente falla al tiro y dice dónde lo busca', () => {
  const srv = servidor();
  rmSync(join(srv.base, '.env'));
  subirRelease(srv, 'a1a1a1a1');

  const resultado = correr(srv);

  assert.notEqual(resultado.status, 0);
  assert.match(estado(srv), /^a1a1a1a1 error\n/);
  assert.match(estado(srv), new RegExp(`falta ${join(srv.base, '.env')}`));
  assert.equal(existsSync(join(srv.home, 'npm.log')), false);
});

test('si npm ci falla, nada cambia de lo que está activo', () => {
  const srv = servidor();
  subirRelease(srv, 'a1a1a1a1');
  correr(srv);
  subirRelease(srv, 'b2b2b2b2', { web: { 'index.html': 'B' } });

  const resultado = correr(srv, { FALLA_EN: 'ci' });

  assert.notEqual(resultado.status, 0);
  assert.match(estado(srv), /^b2b2b2b2 error\n/);
  assert.equal(activo(srv), 'a1a1a1a1');
  assert.equal(readFileSync(enDocroot(srv, 'index.html'), 'utf8'), 'a1a1a1a1');
});

test('volver a desplegar el sha activo no toca el release que está sirviendo', () => {
  const srv = servidor();
  subirRelease(srv, 'a1a1a1a1');
  correr(srv);
  subirRelease(srv, 'a1a1a1a1');

  const resultado = correr(srv, { FALLA_EN: 'ci' });

  assert.notEqual(resultado.status, 0);
  assert.ok(existsSync(join(srv.base, 'current/node_modules')));
  assert.equal(readFileSync(enDocroot(srv, 'index.html'), 'utf8'), 'a1a1a1a1');
});

test('lo que el agente no puso sobrevive a dos releases seguidos', () => {
  const srv = servidor();
  escribir(enDocroot(srv, 'qa.fedal.cl/index.html'), 'carpeta ajena');
  subirRelease(srv, 'a1a1a1a1', { web: { 'index.html': 'A', 'viejo.js': 'A' } });
  correr(srv);
  subirRelease(srv, 'b2b2b2b2', { web: { 'index.html': 'B' } });

  correr(srv);

  assert.equal(activo(srv), 'b2b2b2b2');
  assert.equal(readFileSync(enDocroot(srv, 'ajeno.txt'), 'utf8'), 'lo puso alguien a mano');
  assert.equal(readFileSync(enDocroot(srv, 'api/.htaccess'), 'utf8'), 'PassengerAppRoot');
  assert.equal(
    readFileSync(enDocroot(srv, 'qa.fedal.cl/index.html'), 'utf8'),
    'carpeta ajena',
  );
  assert.equal(existsSync(enDocroot(srv, 'viejo.js')), false);
});

test('.env y subidas/ siguen iguales después de un release', () => {
  const srv = servidor();
  const env = readFileSync(join(srv.base, '.env'), 'utf8');
  subirRelease(srv, 'a1a1a1a1');

  correr(srv);

  assert.equal(estado(srv), 'a1a1a1a1 ok\n');
  assert.equal(readFileSync(join(srv.base, '.env'), 'utf8'), env);
  assert.equal(readFileSync(join(srv.base, 'subidas/torneos/foto.jpg'), 'utf8'), 'foto');
});

test('respalda la base antes de migrar, sin la clave en la línea de comandos', () => {
  const srv = servidor();
  subirRelease(srv, 'a1a1a1a1');

  correr(srv);

  const respaldos = readdirSync(join(srv.base, 'respaldos'));
  assert.equal(respaldos.length, 1);
  assert.match(respaldos[0], /-a1a1a1a1\.sql\.gz$/);
  // Es un dump con los datos personales de los socios: solo lo lee la cuenta.
  assert.equal(statSync(join(srv.base, 'respaldos', respaldos[0])).mode & 0o777, 0o600);
  const dump = execFileSync('gunzip', ['-c', join(srv.base, 'respaldos', respaldos[0])], {
    encoding: 'utf8',
  });
  assert.match(dump, /fedal_qa/);
  assert.doesNotMatch(dump, new RegExp(CLAVE_DE_LA_BASE));
});

test('con admin-inicial.env, el arranque lo recibe y el archivo se borra', () => {
  const srv = servidor();
  escribir(join(srv.base, 'admin-inicial.env'), 'ADMIN_CORREO="admin@fedal.cl"\n');
  subirRelease(srv, 'a1a1a1a1');

  correr(srv);

  assert.equal(
    readFileSync(join(srv.home, 'arranque-recibio'), 'utf8'),
    'ADMIN_CORREO="admin@fedal.cl"\n',
  );
  assert.equal(existsSync(join(srv.base, 'admin-inicial.env')), false);
});

test('quedan los últimos 3 releases', () => {
  const srv = servidor();
  for (const sha of ['a1a1a1a1', 'b2b2b2b2', 'c3c3c3c3', 'd4d4d4d4']) {
    subirRelease(srv, sha);
    correr(srv);
  }

  const shas = readdirSync(join(srv.base, 'releases')).map((dir) => dir.split('.')[0]);
  assert.deepEqual(shas.sort(), [
    'b2b2b2b2',
    'c3c3c3c3',
    'd4d4d4d4',
  ]);
});

test('el agente se reemplaza por el que trae el release', () => {
  const srv = servidor();
  subirRelease(srv, 'a1a1a1a1');

  correr(srv);

  assert.equal(
    readFileSync(join(srv.home, 'fedal/agente.sh'), 'utf8'),
    '# agente del release a1a1a1a1',
  );
});

test('si otra corrida tiene el candado, esta no instala nada', async () => {
  const srv = servidor();
  subirRelease(srv, 'a1a1a1a1');
  const archivoCandado = join(srv.base, '.agente.lock');
  const candado = spawn('flock', [archivoCandado, 'sleep', '5']);
  // Espera a que el candado esté tomado de verdad, no un tiempo fijo.
  while (spawnSync('flock', ['-n', archivoCandado, 'true']).status === 0) {
    await new Promise((listo) => setTimeout(listo, 20));
  }

  const resultado = correr(srv);
  candado.kill();

  assert.equal(resultado.status, 0);
  assert.ok(existsSync(join(srv.base, 'entrante/listo')));
  assert.equal(existsSync(join(srv.base, 'releases')), false);
});
