// Test de deploy/armar-release.sh contra un repo falso: rápido y sin tocar el real.
// El "build" del repo falso solo crea los archivos que dejaría el build de verdad.
// Se corre con `node --test 'deploy/*.test.mjs'` (también desde `npm test`).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const SCRIPT = new URL('./armar-release.sh', import.meta.url).pathname;

function repoFalso() {
  const raiz = mkdtempSync(join(tmpdir(), 'armar-release-'));
  const escribir = (ruta, contenido = '') => {
    mkdirSync(dirname(join(raiz, ruta)), { recursive: true });
    writeFileSync(join(raiz, ruta), contenido);
  };

  const build = [
    'mkdir -p apps/api/dist apps/web/dist/web/browser/reservar',
    'echo main > apps/api/dist/main.js',
    'echo index > apps/web/dist/web/browser/index.html',
    'echo ruta > apps/web/dist/web/browser/reservar/index.html',
  ].join(' && ');

  escribir('package.json', JSON.stringify({ scripts: { build } }));
  escribir('package-lock.json', '{}');
  escribir('.gitignore', 'node_modules/\ndist/\n.env\n');
  escribir('apps/api/package.json', '{}');
  escribir('apps/api/prisma.config.ts');
  escribir('apps/api/prisma/schema.prisma');
  escribir('apps/api/prisma/migrations/migration_lock.toml');
  escribir('apps/api/prisma/migrations/20260101000000_base/migration.sql');
  escribir('apps/api/prisma/seed.ts');
  escribir('apps/api/src/main.ts');
  escribir('apps/api/test/salud.spec.ts');
  escribir('apps/api/.env', 'DATABASE_URL=secreto');
  escribir('apps/web/package.json', '{}');
  escribir('apps/web/src/main.ts');
  escribir('node_modules/rxjs/index.js');
  escribir('docs/pauta.md');
  escribir('deploy/agente.sh');
  mkdirSync(join(raiz, 'deploy'), { recursive: true });
  copyFileSync(SCRIPT, join(raiz, 'deploy/armar-release.sh'));
  copyFileSync(
    new URL(import.meta.url).pathname,
    join(raiz, 'deploy/armar-release.test.mjs'),
  );

  const git = (...args) =>
    execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');

  return { raiz, git };
}

function armar(raiz) {
  return spawnSync('bash', ['deploy/armar-release.sh'], {
    cwd: raiz,
    encoding: 'utf8',
  });
}

function archivosDelTar(ruta) {
  return execFileSync('tar', ['-tzf', ruta], { encoding: 'utf8' })
    .split('\n')
    .map((linea) => linea.replace(/^\.\//, ''))
    .filter((linea) => linea && !linea.endsWith('/'))
    .sort();
}

test('el release trae lo que el servidor necesita y nada más', () => {
  const { raiz, git } = repoFalso();

  const resultado = armar(raiz);

  assert.equal(resultado.status, 0, resultado.stderr);
  const sha = git('rev-parse', '--short=12', 'HEAD');
  const tar = join(raiz, `dist/release/release-${sha}.tar.gz`);
  assert.deepEqual(archivosDelTar(tar), [
    'apps/api/dist/main.js',
    'apps/api/package.json',
    'apps/api/prisma.config.ts',
    'apps/api/prisma/migrations/20260101000000_base/migration.sql',
    'apps/api/prisma/migrations/migration_lock.toml',
    'apps/api/prisma/schema.prisma',
    'apps/web/package.json',
    'deploy/agente.sh',
    'deploy/armar-release.sh',
    'package-lock.json',
    'package.json',
    'web/index.html',
    'web/reservar/index.html',
  ]);
});

test('"listo" lleva el sha del commit y el sha256 del archivo', () => {
  const { raiz, git } = repoFalso();

  armar(raiz);

  const sha = git('rev-parse', '--short=12', 'HEAD');
  const tar = readFileSync(join(raiz, `dist/release/release-${sha}.tar.gz`));
  const suma = createHash('sha256').update(tar).digest('hex');
  assert.equal(
    readFileSync(join(raiz, 'dist/release/listo'), 'utf8'),
    `${sha} ${suma}\n`,
  );
});

test('no arma un release desde un árbol con cambios sin commitear', () => {
  const { raiz } = repoFalso();
  writeFileSync(join(raiz, 'apps/api/src/main.ts'), 'cambio');

  const resultado = armar(raiz);

  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, /sin commitear/);
  assert.equal(existsSync(join(raiz, 'dist/release')), false);
});

test('un release nuevo reemplaza al anterior en dist/release', () => {
  const { raiz, git } = repoFalso();
  armar(raiz);
  writeFileSync(join(raiz, 'apps/api/src/main.ts'), 'cambio');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'otro');

  armar(raiz);

  const sha = git('rev-parse', '--short=12', 'HEAD');
  assert.deepEqual(
    execFileSync('ls', [join(raiz, 'dist/release')], { encoding: 'utf8' })
      .trim()
      .split('\n'),
    ['listo', `release-${sha}.tar.gz`],
  );
});
