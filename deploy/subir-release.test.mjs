// Test de deploy/subir-release.sh con un curl falso que hace de servidor FTP y de agente:
// guarda lo que se sube en una carpeta y, cuando aparece "listo", escribe el "estado" que
// le pida el test. Prueba el orden de la subida y la espera, sin red.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const SCRIPT = new URL('./subir-release.sh', import.meta.url).pathname;
const SHA = 'a1b2c3d4e5f6';
const CLAVE = 'clave-ftp-secreta';

/**
 * El curl falso. `-T archivo url` sube a $SERVIDOR (y aplica -Q -RNFR/-RNTO después);
 * sin -T, descarga: imprime el archivo o sale con 78, como curl cuando no existe.
 * Cuando "listo" queda en su lugar, escribe "estado" según $AGENTE, tras $AGENTE_TRAS
 * consultas. Anota cada llamada en $SERVIDOR/../llamadas.
 */
const CURL_FALSO = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const servidor = process.env.SERVIDOR;
const llamadas = path.join(servidor, '..', 'llamadas');
const netrc = args.includes('--netrc-file')
  ? fs.readFileSync(args[args.indexOf('--netrc-file') + 1], 'utf8')
  : '';
fs.appendFileSync(llamadas, JSON.stringify({ args, netrc }) + '\\n');
const url = args.find((a) => a.startsWith('ftp://'));
const ruta = new URL(url).pathname;
const comandos = args.filter((a, i) => args[i - 1] === '-Q');
const ejecutar = (comando) => {
  const sinAsterisco = comando.replace(/^\\*/, '');
  if (sinAsterisco.startsWith('DELE ')) {
    const archivo = path.join(servidor, sinAsterisco.slice(5));
    if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
    else if (!comando.startsWith('*')) process.exit(21);
  }
};
comandos.filter((c) => !c.startsWith('-')).forEach(ejecutar);
const subida = args.includes('-T') ? args[args.indexOf('-T') + 1] : null;
if (subida) {
  const nombre = ruta.endsWith('/') ? path.basename(subida) : path.basename(ruta);
  fs.copyFileSync(subida, path.join(servidor, nombre));
  const desde = comandos.find((c) => c.startsWith('-RNFR '));
  const hacia = comandos.find((c) => c.startsWith('-RNTO '));
  if (desde && hacia) {
    fs.renameSync(path.join(servidor, desde.slice(6)), path.join(servidor, hacia.slice(6)));
  }
  process.exit(0);
}
const consultas = path.join(servidor, '..', 'consultas');
const n = (fs.existsSync(consultas) ? Number(fs.readFileSync(consultas, 'utf8')) : 0) + 1;
fs.writeFileSync(consultas, String(n));
const listo = path.join(servidor, 'listo');
if (fs.existsSync(listo) && n > Number(process.env.AGENTE_TRAS || 0)) {
  const sha = fs.readFileSync(listo, 'utf8').split(' ')[0];
  if (process.env.AGENTE === 'ok') fs.writeFileSync(path.join(servidor, 'estado'), sha + ' ok\\n');
  if (process.env.AGENTE === 'error') {
    fs.writeFileSync(path.join(servidor, 'estado'), sha + ' error\\nnpm ci falló: sin red\\n');
  }
}
const pedido = path.join(servidor, path.basename(ruta));
if (!fs.existsSync(pedido)) process.exit(78);
process.stdout.write(fs.readFileSync(pedido));
`;

/** Un checkout con el release ya armado por D1, y un servidor FTP vacío. */
function preparar() {
  const raiz = mkdtempSync(join(tmpdir(), 'subir-release-'));
  mkdirSync(join(raiz, 'deploy'));
  copyFileSync(SCRIPT, join(raiz, 'deploy/subir-release.sh'));
  mkdirSync(join(raiz, 'dist/release'), { recursive: true });
  writeFileSync(join(raiz, `dist/release/release-${SHA}.tar.gz`), 'el release');
  writeFileSync(join(raiz, 'dist/release/listo'), `${SHA} ${'f'.repeat(64)}\n`);
  const servidor = join(raiz, 'servidor');
  mkdirSync(servidor);
  const bin = join(raiz, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'curl'), CURL_FALSO);
  chmodSync(join(bin, 'curl'), 0o755);
  return { raiz, servidor, bin };
}

function subir(entorno, cambios = {}) {
  return spawnSync('bash', ['deploy/subir-release.sh'], {
    cwd: entorno.raiz,
    encoding: 'utf8',
    env: {
      PATH: `${entorno.bin}:${process.env.PATH}`,
      SERVIDOR: entorno.servidor,
      FTP_HOST: 'pyme117.pymedns.net',
      FTP_USUARIO: 'deploy-qa@fedal.cl',
      FTP_CLAVE: CLAVE,
      SUBIR_INTERVALO: '0',
      SUBIR_ESPERA_MAX: '5',
      AGENTE: 'ok',
      ...cambios,
    },
  });
}

const llamadas = (entorno) =>
  readFileSync(join(entorno.raiz, 'llamadas'), 'utf8')
    .trim()
    .split('\n')
    .map((linea) => JSON.parse(linea));

test('sube el release y después "listo", que aparece de una vez', () => {
  const entorno = preparar();

  const resultado = subir(entorno);

  assert.equal(resultado.status, 0, resultado.stderr);
  assert.deepEqual(readdirSync(entorno.servidor).sort(), [
    'estado',
    'listo',
    `release-${SHA}.tar.gz`,
  ]);
  const [primera, segunda] = llamadas(entorno);
  assert.ok(primera.args.includes(`dist/release/release-${SHA}.tar.gz`));
  assert.ok(segunda.args.includes('ftp://pyme117.pymedns.net/listo.tmp'));
  assert.ok(segunda.args.includes('-RNFR listo.tmp'));
  assert.ok(segunda.args.includes('-RNTO listo'));
});

test('exige TLS en cada conexión', () => {
  const entorno = preparar();

  subir(entorno);

  for (const llamada of llamadas(entorno)) {
    assert.ok(llamada.args.includes('--ssl-reqd'), JSON.stringify(llamada.args));
  }
});

test('la clave FTP no va en la línea de comandos, sino en un netrc', () => {
  const entorno = preparar();

  subir(entorno);

  for (const llamada of llamadas(entorno)) {
    assert.ok(!llamada.args.some((a) => a.includes(CLAVE)));
    assert.match(llamada.netrc, new RegExp(`password ${CLAVE}`));
  }
});

test('espera hasta que el agente responde', () => {
  const entorno = preparar();

  const resultado = subir(entorno, { AGENTE_TRAS: '3' });

  assert.equal(resultado.status, 0, resultado.stderr);
  assert.ok(Number(readFileSync(join(entorno.raiz, 'consultas'), 'utf8')) >= 4);
  assert.match(resultado.stdout, new RegExp(`${SHA} activo`));
});

test('si el agente no lo activó, sale con error y muestra lo que dijo', () => {
  const entorno = preparar();

  const resultado = subir(entorno, { AGENTE: 'error' });

  assert.equal(resultado.status, 1);
  assert.match(resultado.stderr, /npm ci falló: sin red/);
  assert.match(resultado.stderr, /el release anterior sigue activo/);
});

test('un estado de otro release no cuenta: sin respuesta, se rinde al tope', () => {
  const entorno = preparar();
  writeFileSync(join(entorno.servidor, 'estado'), '000000000000 ok\n');

  const resultado = subir(entorno, { AGENTE: 'nada', SUBIR_ESPERA_MAX: '0' });

  assert.equal(resultado.status, 1);
  assert.match(resultado.stderr, /no respondió/);
});

test('volver a desplegar el mismo sha no se fía del estado de la vez anterior', () => {
  // Es lo que pasa al re-ejecutar un run para volver atrás: el estado viejo ya nombra
  // este sha, y leerlo antes de que el agente actúe daría por activo algo que no lo está.
  const entorno = preparar();
  writeFileSync(join(entorno.servidor, 'estado'), `${SHA} ok\n`);

  const resultado = subir(entorno, { AGENTE: 'nada', SUBIR_ESPERA_MAX: '0' });

  assert.equal(resultado.status, 1);
  assert.match(resultado.stderr, /no respondió/);
});

test('sin las credenciales FTP falla antes de subir nada', () => {
  const entorno = preparar();

  const resultado = subir(entorno, { FTP_CLAVE: '' });

  assert.notEqual(resultado.status, 0);
  assert.equal(existsSync(join(entorno.raiz, 'llamadas')), false);
});
