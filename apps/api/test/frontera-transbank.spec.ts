import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T17. La frontera que sostiene el puerto: **ningún import de Transbank fuera de
 * `src/pagos/adaptadores/`** (`SPEC-pagos.md` § El puerto).
 *
 * Sin este guardia, el primer `import { WebpayPlus }` en un servicio de `reservas`
 * pasa desapercibido en la revisión, y cambiar de pasarela vuelve a ser cirugía.
 * Es la clase de regla que nadie recuerda y que un test recuerda siempre.
 */
describe('Frontera de Transbank', () => {
  const src = join(__dirname, '..', 'src');
  const adaptadores = join(src, 'pagos', 'adaptadores');

  const archivosTs = (directorio: string): string[] =>
    readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
      const ruta = join(directorio, entrada.name);

      if (entrada.isDirectory()) {
        // `generated` es el cliente de Prisma: código escrito por una herramienta,
        // no por nosotros, y no tiene nada de Transbank.
        return entrada.name === 'generated' ? [] : archivosTs(ruta);
      }

      return entrada.name.endsWith('.ts') ? [ruta] : [];
    });

  // Imports y no menciones: los comentarios nombran a Webpay para explicar por qué
  // las cosas son como son, y prohibir la palabra obligaría a escribir comentarios
  // que no pueden decir de qué hablan.
  const importaTransbank = (codigo: string) =>
    /(?:from\s+|require\()\s*['"]transbank/.test(codigo);

  it('solo los adaptadores importan Transbank', () => {
    const infractores = archivosTs(src)
      .filter((ruta) => !ruta.startsWith(adaptadores))
      .filter((ruta) => importaTransbank(readFileSync(ruta, 'utf8')));

    expect(infractores).toEqual([]);
  });

  it('el guardia reconoce un import de Transbank cuando lo ve', () => {
    // Sin esto, una expresión regular mal escrita deja el test verde para siempre.
    expect(
      importaTransbank("import { WebpayPlus } from 'transbank-sdk';"),
    ).toBe(true);
    expect(importaTransbank("const t = require('transbank-sdk');")).toBe(true);
    expect(
      importaTransbank('// el adaptador de Webpay vive en adaptadores/'),
    ).toBe(false);
  });

  it('el guardia mira los archivos correctos', () => {
    // Sin esto, un error en el recorrido —un directorio que no se visita, una
    // extensión que no se reconoce— dejaría la lista vacía y el test verde para
    // siempre, que es la peor forma de fallar que tiene un guardia.
    const archivos = archivosTs(src);

    expect(archivos.length).toBeGreaterThan(20);
    expect(archivos.some((ruta) => ruta.endsWith('pagos.service.ts'))).toBe(
      true,
    );
    expect(
      archivos.some((ruta) =>
        ruta.endsWith(join('adaptadores', 'webpay.adapter.ts')),
      ),
    ).toBe(true);
  });
});
