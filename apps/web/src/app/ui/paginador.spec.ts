import { describe, expect, it } from 'vitest';

import { PaginadorEnEspanol } from './paginador';

/** T259. La cuenta de `mat-paginator`, en español y por página. */
describe('PaginadorEnEspanol', () => {
  const cuenta = new PaginadorEnEspanol().getRangeLabel;

  it('cuenta las páginas por lo alto: 25 en tandas de 10 son 3', () => {
    expect(cuenta(0, 10, 25)).toBe('Página 1 de 3');
    expect(cuenta(2, 10, 25)).toBe('Página 3 de 3');
  });

  it('una lista vacía sigue siendo una página, no cero', () => {
    expect(cuenta(0, 10, 0)).toBe('Página 1 de 1');
  });
});
