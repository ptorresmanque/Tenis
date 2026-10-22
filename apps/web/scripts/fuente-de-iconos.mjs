// La fuente de íconos con solo los que usa la web (T369). La completa pesa 397 KB y frenaba el LCP:
// se precarga en cada página y baja junto con la foto principal.
//
//   node apps/web/scripts/fuente-de-iconos.mjs
//
// Lee src/fuentes/iconos-en-uso.txt (la lista que cuida src/app/ui/iconos.spec.ts) y recorta
// material-symbols-sharp.completa.woff2, que se versiona como fuente de todo esto y no se publica.
// Pide fontTools (`pip install fonttools brotli`): pyftsubset y ttx.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const fuentes = join(new URL('..', import.meta.url).pathname, 'src/fuentes');
const completa = join(fuentes, 'material-symbols-sharp.completa.woff2');
const salida = join(fuentes, 'material-symbols-sharp.woff2');
const iconos = readFileSync(join(fuentes, 'iconos-en-uso.txt'), 'utf8').split('\n').filter(Boolean);

/**
 * Los íconos de una fuente: cada nombre que se escribe y los glifos que lo dibujan. La ligadura
 * arma el ícono y después `rclt` lo cambia por su variante rellena: «place» → place.fill. Sin la
 * variante, la recortada se queda con el glifo de la ligadura, que no es el que dibuja la completa.
 */
function iconosDe(archivo) {
  const xml = execFileSync('ttx', ['-q', '-t', 'cmap', '-t', 'GSUB', '-o', '-', archivo], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const cmap = new Map(
    [...xml.matchAll(/<map code="0x([0-9a-f]+)" name="([^"]+)"\/>/g)].map(([, codigo, glifo]) => [
      String.fromCodePoint(parseInt(codigo, 16)),
      glifo,
    ]),
  );
  const letra = new Map([...cmap].map(([caracter, glifo]) => [glifo, caracter]));
  const variante = new Map(
    [...xml.matchAll(/<Substitution in="([^"]+)" out="([^"]+)"\/>/g)].map(([, de, a]) => [de, a]),
  );
  const resultado = new Map();
  for (const [, primera, cuerpo] of xml.matchAll(
    /<LigatureSet glyph="([^"]+)">([\s\S]*?)<\/LigatureSet>/g,
  )) {
    for (const [, componentes, glifo] of cuerpo.matchAll(
      /<Ligature components="([^"]*)" glyph="([^"]+)"\/>/g,
    )) {
      const letras = [primera, ...componentes.split(',')].map((g) => letra.get(g));
      if (letras.every(Boolean)) {
        resultado.set(letras.join(''), {
          glifos: [glifo, variante.get(glifo)].filter(Boolean),
          final: variante.get(glifo) ?? glifo,
        });
      }
    }
  }
  return { iconos: resultado, cmap };
}

// Casi siempre el glifo se llama como el ícono, pero no siempre: «create» dibuja el glifo de otro.
const deLaCompleta = iconosDe(completa);
const sinGlifo = iconos.filter((icono) => !deLaCompleta.iconos.has(icono));
if (sinGlifo.length > 0) throw new Error(`No están en la fuente completa: ${sinGlifo.join(', ')}`);

// Las letras con que se escribe cada nombre, para que la ligadura se arme. También en mayúscula:
// la completa lleva la «A» al mismo glifo que la «a», y un ícono dentro de un rótulo con
// `uppercase` se escribe «PLACE».
const minusculas = 'abcdefghijklmnopqrstuvwxyz0123456789_';
const letras = minusculas + minusculas.toUpperCase();

execFileSync('pyftsubset', [
  completa,
  `--glyphs=${[...new Set(iconos.flatMap((icono) => deLaCompleta.iconos.get(icono).glifos))].join(',')}`,
  `--text=${letras}`,
  // Sin esto, el cierre de las ligaduras volvería a traer los 4299 íconos: todas se escriben con
  // las mismas letras.
  '--no-layout-closure',
  '--layout-features=*',
  // Los nombres de los glifos, para comparar abajo el que dibuja cada ícono con el de la completa.
  '--glyph-names',
  '--flavor=woff2',
  `--output-file=${salida}`,
]);

// Cada ícono de la lista tiene que terminar en el mismo glifo que en la completa.
const deLaNueva = iconosDe(salida);
const distintos = iconos.filter(
  (icono) => deLaNueva.iconos.get(icono)?.final !== deLaCompleta.iconos.get(icono).final,
);
if (distintos.length > 0)
  throw new Error(`No se dibujan como en la completa: ${distintos.join(', ')}`);
// Y cada letra, minúscula o mayúscula, tiene que llevar al mismo glifo que en la completa.
const otraLetra = [...letras].filter((l) => deLaNueva.cmap.get(l) !== deLaCompleta.cmap.get(l));
if (otraLetra.length > 0) throw new Error(`Letras que cambiaron de glifo: ${otraLetra.join(' ')}`);

const kb = (archivo) => Math.round(statSync(archivo).size / 1024);
console.log(`${iconos.length} íconos: ${kb(completa)} KB → ${kb(salida)} KB`);
