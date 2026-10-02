import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

import { VOSEO } from '../../web/src/voseo';

/**
 * El voseo rioplatense tampoco entra por la API.
 *
 * El test del front (`apps/web/src/design-tokens.spec.ts`) solo mira las
 * plantillas, y el 2026-10-02 se vio que los mensajes de error de la API
 * llegaban voseando a la pantalla tal cual: "Declará con quién vas a jugar…",
 * "Elegí una que todavía no haya empezado". La lista de formas es la misma
 * para los dos lados.
 *
 * Mira todos los literales de texto y no solo los `message:` o los argumentos
 * de una `*Exception(...)`: el motivo de `cupo.ts` viaja en un `mensaje:` y
 * llega igual a la pantalla. Leer los literales con el parser de TypeScript
 * deja afuera los comentarios, donde "elegí" puede ser el pretérito legítimo
 * de la primera persona, y los nombres de variables.
 *
 * Además de `src/` mira `prisma/`, porque lo que escribe el seed (canchas,
 * torneos, categorías) termina en la pantalla igual que un mensaje, y
 * `scripts/`, porque `probar-webpay.ts` le muestra una página a quien prueba
 * el pago.
 */
describe('Español de Chile en la API', () => {
  const API = join(__dirname, '..');

  // `src/generated/` lo escribe `prisma generate`: su texto sale del schema, no
  // de un mensaje que alguien redacte para el socio.
  const archivos = ['src', 'prisma', 'scripts']
    .flatMap((carpeta) =>
      readdirSync(join(API, carpeta), {
        recursive: true,
        encoding: 'utf8',
      }).map((ruta) => join(carpeta, ruta)),
    )
    .filter((ruta) => /\.(ts|mjs)$/.test(ruta) && !ruta.endsWith('.spec.ts'))
    .filter((ruta) => !ruta.startsWith(join('src', 'generated')));

  it('encuentra código que revisar', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it('ningún texto de la API usa voseo rioplatense', () => {
    const infractores: string[] = [];

    for (const archivo of archivos) {
      const fuente = ts.createSourceFile(
        archivo,
        readFileSync(join(API, archivo), 'utf8'),
        ts.ScriptTarget.Latest,
      );

      const revisar = (nodo: ts.Node): void => {
        if (ts.isStringLiteralLike(nodo) || ts.isTemplateLiteralToken(nodo)) {
          for (const [forma] of nodo.text.matchAll(VOSEO)) {
            const { line } = fuente.getLineAndCharacterOfPosition(
              nodo.getStart(fuente),
            );
            infractores.push(`${archivo}:${line + 1}: "${forma}"`);
          }
        }
        ts.forEachChild(nodo, revisar);
      };
      revisar(fuente);
    }

    expect(infractores).toEqual([]);
  });
});
