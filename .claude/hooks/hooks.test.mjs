// node --test .claude/hooks/hooks.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const aqui = import.meta.dirname;

function correr(hook, entrada, env = {}) {
  const r = spawnSync('node', ['--no-warnings', join(aqui, hook)], {
    input: JSON.stringify(entrada),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  const decision = r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'sigue';
  return { status: r.status, decision, stderr: r.stderr };
}

const guardia = (command, cwd = aqui) => correr('guardia.mjs', { tool_input: { command }, cwd }).decision;

test('PR: sin --base se frena, hacia qa pasa, apilado se frena', () => {
  assert.equal(guardia('gh pr create --title "T1" --body x'), 'deny');
  assert.equal(guardia('gh pr create --base qa --title "T1"'), 'sigue');
  assert.equal(guardia('gh pr create -B qa --title "T1"'), 'sigue');
  assert.equal(guardia('gh pr create -Bqa --title "T1"'), 'sigue');
  assert.equal(guardia('gh pr create -B=qa --title "T1"'), 'sigue');
  assert.equal(guardia('gh pr create --base "qa" --title "T1"'), 'sigue');
  assert.equal(guardia('gh pr create --base=otra-rama --title "T1"'), 'deny');
});

test('PR: lo que solo nombra gh pr create o -B en un texto no cuenta', () => {
  assert.equal(guardia('grep -rn "gh pr create" tasks/'), 'sigue');
  assert.equal(guardia('gh pr create --title "Quita el -B viejo" --base qa'), 'sigue');
});

test('PR hacia main: la promoción pasa, otra rama pregunta', () => {
  assert.equal(guardia('gh pr create --base main --head qa --title "Promoción"'), 'sigue');
  assert.equal(guardia('gh pr create --base main --head ptorresmanque:qa --title "Promoción"'), 'sigue');
  assert.equal(guardia('gh pr create --base main --head arreglo-urgente --title "x"'), 'ask');
});

test('voseo: en el commit y en el PR se frena; una cita entre «» o un texto limpio, no', () => {
  assert.equal(guardia('git commit -m "Ahora tenés la reserva al tiro"'), 'deny');
  assert.equal(guardia('git -C apps commit -m "Ahora tenés la reserva"'), 'deny');
  assert.equal(guardia(`git commit -F - <<'EOF'\nLa reserva\n\nAhora podés pagar\nEOF`), 'deny');
  assert.equal(guardia('gh pr create --base qa --title "Ahora podés reservar"'), 'deny');
  assert.equal(guardia('git commit -m "Cambia el «Reservá» de la portada por «Reserva»"'), 'sigue');
  assert.equal(guardia('git commit -m "Documenta que gh pr create sin base va a main"'), 'sigue');
});

// Un proyecto de mentira con un servidor escuchando desde su apps/api, como el preview.
let proyecto, servidor;
before(async () => {
  proyecto = realpathSync(mkdtempSync(join(tmpdir(), 'guardia-')));
  const repo = (dir) => {
    mkdirSync(join(dir, 'apps/api'), { recursive: true });
    mkdirSync(join(dir, 'apps/web'), { recursive: true });
    execFileSync('git', ['init', '-q', dir]);
  };
  repo(proyecto);
  repo(join(proyecto, '.claude/worktrees/otro'));
  servidor = spawn('node', ['-e', "require('http').createServer().listen(0, () => console.log('listo'))"], {
    cwd: join(proyecto, 'apps/api'),
  });
  await new Promise((listo) => servidor.stdout.once('data', listo));
});
after(() => {
  servidor?.kill();
  rmSync(proyecto, { recursive: true, force: true });
});

test('build: el de la API con su servidor arriba se frena, como sea que se escriba', () => {
  for (const c of [
    'npm run build -w apps/api',
    'npm -w apps/api run build',
    'npm --prefix apps/api run build',
    'npm run build',
    'npm run build -w apps/web && npm run build -w apps/api',
    'cd apps/api && npx nest build',
  ]) {
    assert.equal(guardia(c, proyecto), 'deny', c);
  }
  assert.equal(guardia('npm run build', join(proyecto, 'apps/api')), 'deny');
});

test('build: la web, otro worktree o un texto que lo nombra, no', () => {
  for (const c of [
    'npm run build -w apps/web',
    'cd apps/web && npx ng build',
    'git commit -m "Corre npm run build en el CI"',
    'grep -rn "nest build" apps/api',
    'cd .claude/worktrees/otro && npm run build',
    'npm test -w apps/api',
  ]) {
    assert.equal(guardia(c, proyecto), 'sigue', c);
  }
  assert.equal(guardia('npm run build', join(proyecto, 'apps/web')), 'sigue');
});

test('voseo al editar: avisa con la línea, calla en texto limpio y en los archivos de la regla', () => {
  const dir = mkdtempSync(join(tmpdir(), 'voseo-'));
  const escribir = (nombre, texto) => {
    mkdirSync(join(dir, nombre, '..'), { recursive: true });
    writeFileSync(join(dir, nombre), texto);
    return correr('voseo.mjs', { tool_input: { file_path: join(dir, nombre) } }, { CLAUDE_PROJECT_DIR: dir });
  };

  const sucio = escribir('a.html', '<p>Hola</p>\n<button>Reservá ahora</button>\n');
  assert.equal(sucio.status, 2);
  assert.match(sucio.stderr, /a\.html:2 «Reservá»/);

  assert.equal(escribir('b.html', '<button>Reserva ahora</button>').status, 0);
  assert.equal(escribir('apps/web/src/voseo.ts', 'export const VOSEO = /tenés/;').status, 0);
  assert.equal(escribir('.claude/worktrees/x/CLAUDE.md', 'Prohibido «tenés»').status, 0);
  assert.equal(escribir('d.png', 'tenés').status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('lint de la API: fuera de apps/api/{src,test} no hace nada', () => {
  for (const f of ['/x/apps/web/src/a.ts', '/x/apps/api/prisma/seed.ts', '/x/apps/api/src/generated/a.ts', '/x/README.md']) {
    assert.equal(correr('lint-api.mjs', { tool_input: { file_path: f } }).status, 0, f);
  }
});
