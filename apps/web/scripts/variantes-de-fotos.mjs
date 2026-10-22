// Las variantes WebP de las fotos del sitio (T366, SPEC-seo.md A10), y la imagen de Open Graph.
// Se corre a mano al agregar o cambiar una foto de public/fotos/, y lo que deja se versiona:
//
//   node apps/web/scripts/variantes-de-fotos.mjs
//
// Los anchos son los de ANCHOS_DE_FOTO en src/app/ui/foto.ts, que es lo que pide el loader. Una
// foto más angosta que un ancho no se agranda: la variante queda con su ancho real.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const web = fileURLToPath(new URL('..', import.meta.url));
const fotos = join(web, 'public/fotos');
const ANCHOS = [640, 1080, 1600];

for (const foto of readdirSync(fotos).filter((archivo) => archivo.endsWith('.jpg'))) {
  for (const ancho of ANCHOS) {
    const destino = join(fotos, foto.replace(/\.jpg$/, `-${ancho}.webp`));
    const { size, width } = await sharp(join(fotos, foto))
      .resize({ width: ancho, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(destino);
    console.log(`${foto} → ${ancho}: ${width} px, ${Math.round(size / 1024)} KB`);
  }
}

// La de Open Graph (T353), recortada de la vista aérea del club.
await sharp(join(fotos, 'el-club.jpg'))
  .resize(1200, 630, { fit: 'cover' })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(join(web, 'public/og.jpg'));
console.log('og.jpg → 1200 × 630');
