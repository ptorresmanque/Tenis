// PostToolUse de Edit|Write: avisa del voseo en el archivo recién editado.
//
// Los tests (`design-tokens.spec.ts` y `espanol-de-chile.spec.ts`) cuidan las plantillas y
// los textos de la API, y dejan fuera los comentarios a propósito. CLAUDE.md, en cambio, rige
// para todo: comentarios, specs, planes. Y encontrar voseo en un archivo que se toca por otra
// razón es motivo para corregirlo ahí mismo, por eso se mira el archivo entero y no solo lo nuevo.
//
// Es un aviso: en un comentario, «elegí» puede ser el pretérito de la primera persona.
import { readFileSync } from 'node:fs';
import { extname, relative } from 'node:path';
import { VOSEO } from '../../apps/web/src/voseo.ts';

const entrada = JSON.parse(readFileSync(0, 'utf8'));
const archivo = entrada.tool_input?.file_path;
const proyecto = process.env.CLAUDE_PROJECT_DIR ?? entrada.cwd ?? process.cwd();
const ruta = archivo ? relative(proyecto, archivo) : '';

const conTexto = ['.ts', '.html', '.md', '.mjs', '.json', '.txt', '.scss'];
if (!archivo || ruta.startsWith('..') || ruta.includes('node_modules') || !conTexto.includes(extname(archivo))) {
  process.exit(0);
}
// Los que nombran el voseo a propósito: la lista de lo prohibido, la regla y sus pruebas, y la
// lista de íconos de Material (el ícono `sos`). También dentro de un worktree.
const excepciones = [
  'CLAUDE.md',
  'apps/web/src/voseo.ts',
  'apps/web/src/design-tokens.spec.ts',
  'apps/api/src/espanol-de-chile.spec.ts',
  'apps/web/src/fuentes/nombres-material-symbols.txt',
  '.claude/hooks/guardia.mjs',
  '.claude/hooks/voseo.mjs',
  '.claude/hooks/hooks.test.mjs',
];
if (excepciones.some((e) => ruta === e || ruta.endsWith(`/${e}`))) process.exit(0);

let texto;
try {
  texto = readFileSync(archivo, 'utf8');
} catch {
  process.exit(0);
}

const hallazgos = [];
texto.split('\n').forEach((linea, i) => {
  for (const m of linea.matchAll(VOSEO)) hallazgos.push(`  ${ruta}:${i + 1} «${m[0]}»`);
});
if (hallazgos.length) {
  console.error(
    `Voseo en ${ruta} (CLAUDE.md pide tuteo chileno: reserva, elige, tienes):\n${hallazgos.join('\n')}\n` +
      'Corrígelo, salvo que sea un pretérito legítimo en primera persona («yo elegí»).',
  );
  process.exit(2);
}
