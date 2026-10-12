import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * T158: **el stock se escribe en un solo lugar**, `tienda/stock.ts`.
 *
 * Toda escritura de `Variante.stock` va junto a su movimiento, en la misma transacción
 * (`SPEC-tienda.md` § Stock). Si otro archivo la escribe, el stock cambia sin dejar
 * rastro, y "el stock no me cuadra" deja de tener respuesta. Este test recorre el código
 * y falla si encuentra una escritura de `variante` que nombre `stock`, o SQL a mano que
 * toque esa columna, fuera de `stock.ts`.
 *
 * `ponytail: busca por texto, no por tipos. El techo: una escritura armada en una
 * variable aparte (const data = { stock }) no la ve. Si alguna vez hace falta, se pasa a
 * una extensión de Prisma que rechace stock en variante salvo desde moverStock.`
 */
describe('El stock se escribe solo en tienda/stock.ts', () => {
  const RAIZ = join(__dirname, '..');
  const PERMITIDO = join(RAIZ, 'tienda', 'stock.ts');

  const archivos = (carpeta: string): string[] =>
    readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) {
        return entrada.name === 'generated' ? [] : archivos(ruta);
      }
      return ruta.endsWith('.ts') && !ruta.endsWith('.spec.ts') ? [ruta] : [];
    });

  /** El texto entre el paréntesis que abre en `desde` y el que lo cierra. */
  const argumentos = (texto: string, desde: number): string => {
    let profundidad = 0;
    for (let i = desde; i < texto.length; i++) {
      if (texto[i] === '(') profundidad++;
      if (texto[i] === ')' && --profundidad === 0)
        return texto.slice(desde, i + 1);
    }
    return texto.slice(desde);
  };

  it('ningún otro archivo escribe la columna stock', () => {
    const infractores: string[] = [];
    const ESCRITURA =
      /\.variante\.(create|createMany|update|updateMany|upsert)\(/g;
    const SQL = /\$(executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe)/g;

    for (const archivo of archivos(RAIZ)) {
      if (archivo === PERMITIDO) continue;
      const texto = readFileSync(archivo, 'utf8');

      for (const llamada of texto.matchAll(ESCRITURA)) {
        const inicio = llamada.index + llamada[0].length - 1;
        if (/\bstock\b/.test(argumentos(texto, inicio))) {
          infractores.push(
            `${relative(RAIZ, archivo)}: variante.${llamada[1]}`,
          );
        }
      }
      for (const llamada of texto.matchAll(SQL)) {
        const resto = texto.slice(llamada.index, llamada.index + 400);
        if (/\bvariante\b/i.test(resto) && /\bstock\b/i.test(resto)) {
          infractores.push(
            `${relative(RAIZ, archivo)}: SQL a mano sobre variante.stock`,
          );
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it('el detector ve una escritura de stock, para que el test no pase por estar ciego', () => {
    const ejemplo =
      'await tx.variante.update({ where: { id }, data: { stock: { increment: 1 } } });';
    const llamada = /\.variante\.(update)\(/.exec(ejemplo)!;

    expect(
      /\bstock\b/.test(
        argumentos(ejemplo, llamada.index + llamada[0].length - 1),
      ),
    ).toBe(true);
  });
});
