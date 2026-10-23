// PostToolUse de Edit|Write: `eslint --fix` sobre el archivo de la API recién editado.
//
// El CI corre `npm run lint` (con --fix) y falla si el lint deja cambios: este hook los deja
// hechos antes. Solo en `apps/api`, donde Prettier entra por `prettier/prettier` y todo está
// formateado. En `apps/web` no: muchos archivos no siguen Prettier y reformatearlos enteros
// llena el diff de ruido (T222).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const archivo = JSON.parse(readFileSync(0, 'utf8')).tool_input?.file_path ?? '';
// La API se saca del propio archivo y no de la carpeta de la sesión: así también vale para un
// archivo de un worktree editado desde la carpeta principal.
const i = archivo.lastIndexOf('/apps/api/');
if (i < 0) process.exit(0);
const api = archivo.slice(0, i + '/apps/api'.length);
const ruta = relative(api, archivo);

// Lo mismo que mira el script `lint` de la API, menos lo que escribe `prisma generate`.
if (!/^(src|test)\/.+\.ts$/.test(ruta) || ruta.startsWith('src/generated/')) process.exit(0);

// El `--` va porque npx (npm 11) se queda con `--fix` como opción propia y eslint no la recibe.
const r = spawnSync('npx', ['--no', '--', 'eslint', '--fix', '--quiet', ruta], { cwd: api, encoding: 'utf8' });
if (r.status !== 0) {
  console.error(`ESLint deja errores en apps/api/${ruta} (el CI los rechaza):\n${r.stdout || r.stderr}`);
  process.exit(2);
}
