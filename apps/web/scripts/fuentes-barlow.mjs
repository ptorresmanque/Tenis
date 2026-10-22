// Las Barlow sin lo que el sitio no usa (T372). Las seis de la portada bajan junto con la foto que
// mide el LCP. De cada una se van los nombres de los glifos, que el navegador no lee, y las tablas
// `mark` y `mkmk`, que ubican los diacríticos combinables (U+0300–036F) sobre cada letra. Las letras
// acentuadas vienen compuestas en la fuente, y «e» + «◌́» se dibuja con la «é». Los combinables
// siguen en la fuente: sin ellos, Safari dibujaba esa letra con la del sistema.
//
//   node apps/web/scripts/fuentes-barlow.mjs
//
// Lee src/fuentes/google/, los archivos tal como los entregaba Google (el subconjunto latin), que
// se versionan como fuente de esto y no se publican, y deja las recortadas en src/fuentes/.
// Pide fontTools (`pip install fonttools brotli`): pyftsubset y ttx. Con la 4.63.0, los mismos
// archivos dan los mismos bytes.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fuentes = join(fileURLToPath(new URL('..', import.meta.url)), 'src/fuentes');
const SE_VAN = new Set(['mark', 'mkmk']);
const ttx = (archivo, ...tablas) =>
  execFileSync('ttx', ['-q', ...tablas.flatMap((t) => ['-t', t]), '-o', '-', archivo], {
    encoding: 'utf8',
  });

/** Los caracteres que dibuja una fuente, por su cmap. */
const caracteres = (archivo) =>
  new Set([...ttx(archivo, 'cmap').matchAll(/<map code="0x([0-9a-f]+)"/g)].map(([, c]) => c));

/** Los rasgos de OpenType de una fuente: `tnum`, `kern`, `liga`… */
const rasgos = (archivo) =>
  new Set(
    [...ttx(archivo, 'GSUB', 'GPOS').matchAll(/<FeatureTag value="(\w+)"/g)].map(([, r]) => r),
  );

const kb = (archivo) => (statSync(archivo).size / 1024).toFixed(1);

const barlow = readdirSync(join(fuentes, 'google')).filter((n) => /^barlow-.*\.woff2$/.test(n));

for (const nombre of barlow) {
  const original = join(fuentes, 'google', nombre);
  const recortada = join(fuentes, nombre);
  const quedan = [...rasgos(original)].filter((r) => !SE_VAN.has(r));

  execFileSync('pyftsubset', [
    original,
    '--unicodes=*',
    // Los rasgos de la original, no los de omisión de pyftsubset: el sitio usa las cifras
    // tabulares (`tnum`).
    `--layout-features=${quedan.join(',')}`,
    // Todos los nombres: el 13 y el 14 son la licencia OFL, que tiene que viajar con la fuente.
    '--name-IDs=*',
    '--flavor=woff2',
    `--output-file=${recortada}`,
  ]);

  // La recortada dibuja los mismos caracteres que la de Google, con sus rasgos y su licencia.
  const tiene = caracteres(recortada);
  const faltan = [...caracteres(original)].filter((c) => !tiene.has(c));
  if (faltan.length > 0) throw new Error(`${nombre}: no dibuja U+${faltan.join(' U+')}`);
  const conservo = rasgos(recortada);
  const sinRasgo = quedan.filter((r) => !conservo.has(r));
  if (sinRasgo.length > 0) throw new Error(`${nombre}: perdió ${sinRasgo.join(', ')}`);
  if (!ttx(recortada, 'name').includes('scripts.sil.org/OFL'))
    throw new Error(`${nombre}: perdió la licencia`);

  console.log(`${nombre}: ${kb(original)} KB → ${kb(recortada)} KB`);
}
