// PreToolUse de Bash: frena tres errores que este proyecto ya pagó.
//
// 1. `gh pr create` sin `--base` abre el PR hacia `main`, la rama por defecto del repo. Las
//    ramas de trabajo van a `qa`; a `main` solo llega la promoción desde `qa` o una urgencia
//    de producción (CLAUDE.md, «Ramas y despliegue»). Una base que no es ninguna de las dos es
//    un PR apilado, y el 2026-10-06 unos así se fusionaron hacia ramas que no iban a ninguna parte.
// 2. El build de la API borra `apps/api/dist/`, y el `nest start --watch` del preview muere con
//    «Cannot find module dist/main» (T127, 2026-10-09). Solo se frena si un proceso que escucha
//    en algún puerto corre desde el `apps/api` que se va a compilar: cada worktree tiene el suyo.
// 3. Voseo en el mensaje de un commit o en el título y el cuerpo de un PR: los tests miran
//    plantillas y textos de la API, no esto, y CLAUDE.md lo incluye.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { VOSEO } from '../../apps/web/src/voseo.ts';

const entrada = JSON.parse(readFileSync(0, 'utf8'));
const comando = entrada.tool_input?.command ?? '';

function responder(decision, motivo) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: motivo,
      },
    }),
  );
  process.exit(0);
}

// Con error también devuelve lo que alcanzó a escribir: lsof sale con 1 si uno de los procesos
// terminó entre medio o es de otro usuario, y los demás siguen sirviendo.
function sh(cmd, args, opciones = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opciones }).trim();
  } catch (e) {
    return e.stdout?.trim() ?? '';
  }
}

function real(ruta) {
  try {
    return realpathSync(ruta);
  } catch {
    return ruta;
  }
}

// Sin heredocs ni textos entre comillas, para que un `grep "gh pr create"` o un mensaje de commit
// que nombra `npm run build` no cuenten como esas órdenes. Un texto simple entre comillas
// (`--base "qa"`) se queda sin ellas; el resto pasa a `""`.
const limpio = comando
  .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?^\s*\2\s*$/gm, '')
  .replace(/(["'])([\w./:=~-]*)\1/g, '$2')
  .replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""');

// Cada orden con la carpeta donde corre, siguiendo los `cd` (el cwd se mantiene entre llamadas).
let dir = entrada.cwd ?? process.cwd();
const ordenes = [];
for (const parte of limpio.split(/&&|\|\||[;|\n]/)) {
  const orden = parte.replace(/^[\s({$]*(?:\w+=\S*\s+)*/, '').trim();
  const cd = orden.match(/^cd\s+(\S+)/);
  if (cd) dir = resolve(dir, cd[1].replace(/^~(?=\/|$)/, homedir()));
  else if (orden) ordenes.push({ orden, dir });
}

// --- 1. La base del PR ---
for (const { orden, dir } of ordenes) {
  if (!/^gh\s+pr\s+create\b/.test(orden)) continue;
  const base = orden.match(/(?:^|\s)(?:--base|-B)[=\s]*([\w./-]+)/)?.[1];
  if (!base) {
    responder(
      'deny',
      'Sin --base, gh abre el PR hacia main (la rama por defecto del repo). Las ramas de trabajo van a qa: agrega --base qa. Solo la promoción (--head qa) o una urgencia de producción llevan --base main.',
    );
  }
  if (base !== 'qa' && base !== 'main') {
    responder('deny', `Base «${base}»: eso es un PR apilado, y CLAUDE.md pide no apilarlos. La base va en qa.`);
  }
  if (base === 'main') {
    const head =
      orden.match(/(?:^|\s)(?:--head|-H)[=\s]*(?:[\w.-]+:)?([\w./-]+)/)?.[1] ??
      sh('git', ['branch', '--show-current'], { cwd: dir });
    if (head !== 'qa') {
      responder(
        'ask',
        `PR de «${head}» hacia main. A main solo llega la promoción desde qa o una urgencia de producción (que después también va a qa). ¿Es una urgencia?`,
      );
    }
  }
}

// --- 2. Voseo en el commit o en el PR ---
// Se busca en el comando original, que es donde está el mensaje. Lo que va entre «» es una
// cita, como en: Cambia el «Reservá» de la portada. No cuenta.
const conTexto = ordenes.filter(({ orden }) => /^(?:git\s+(?:-C\s+\S+\s+)?commit|gh\s+pr\s+(?:create|edit))\b/.test(orden));
if (conTexto.length) {
  let texto = comando;
  for (const { orden, dir } of conTexto) {
    const archivo = orden.match(/(?:^|\s)(?:-F|--file|--body-file)[=\s]*(\S+)/)?.[1];
    if (archivo && archivo !== '-' && existsSync(resolve(dir, archivo))) texto += '\n' + readFileSync(resolve(dir, archivo), 'utf8');
  }
  const formas = [...new Set([...texto.replace(/«[^»]*»/g, '').matchAll(VOSEO)].map((m) => m[0]))];
  if (formas.length) {
    responder(
      'deny',
      `El texto vosea: ${formas.map((f) => `«${f}»`).join(', ')}. CLAUDE.md pide tuteo chileno también en commits y PR (reserva, elige, tienes).`,
    );
  }
}

// --- 3. El build de la API con su preview arriba ---
const npmBuild = /^npm\b(?:\s+(?:-w|--workspace|--prefix)[=\s]*\S+|\s+-\S+)*\s+(?:run(?:-script)?\s+)?build\b/;
const aCompilar = [];
for (const { orden, dir } of ordenes) {
  let paquete;
  if (/^(?:npx\s+)?nest\s+build\b/.test(orden)) paquete = dir;
  else if (npmBuild.test(orden)) {
    const prefijo = orden.match(/--prefix[=\s]+(\S+)/)?.[1];
    const ws = orden.match(/(?:^|\s)(?:-w|--workspace)[=\s]*(\S+)/)?.[1];
    const raiz = sh('git', ['rev-parse', '--show-toplevel'], { cwd: dir }) || dir;
    paquete = prefijo ? resolve(dir, prefijo) : ws ? join(raiz, ws.startsWith('apps/') ? ws : `apps/${ws}`) : dir;
  } else continue;

  const raiz = real(sh('git', ['rev-parse', '--show-toplevel'], { cwd: paquete }) || paquete);
  const api = join(raiz, 'apps/api');
  // El build de la raíz compila la API y después la web.
  if (real(paquete) === raiz || real(paquete) === api) aCompilar.push(api);
}
if (aCompilar.length) {
  const pids = sh('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-t']).split('\n').filter(Boolean);
  const carpetas = pids.length
    ? [...sh('lsof', ['-a', '-p', [...new Set(pids)].join(','), '-d', 'cwd', '-Fn']).matchAll(/^n(.+)$/gm)].map((m) => m[1])
    : [];
  const api = aCompilar.find((a) => carpetas.includes(a));
  if (api) {
    responder(
      'deny',
      `Hay un servidor corriendo desde ${api} (el preview), y el build de la API borra su dist/: el servidor muere y la web queda con 502 en /api. Para revisar tipos corre los tests de la API (ts-jest compila). Si de verdad necesitas el build, detén ese preview antes (preview_stop) y vuelve a levantarlo después.`,
    );
  }
}
