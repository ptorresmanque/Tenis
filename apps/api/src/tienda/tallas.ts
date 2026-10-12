import type { FilaDeTallas } from './catalogo-admin.dto';

/**
 * La talla de una variante como la lee el comprador: "CL 40 · US 8 · EU 41" en una
 * categoría con tabla, con la fila de la marca. Sin la fila, la etiqueta sola: **una
 * conversión inventada vende una zapatilla que no calza.**
 */
export function textoDeTalla(
  etiqueta: string,
  usaTablaDeTallas: boolean,
  filas: FilaDeTallas[],
): string {
  const talla = etiqueta.trim();
  if (!usaTablaDeTallas) return talla;

  const fila = filas.find(
    (f) => f.tallaCl.toLowerCase() === talla.toLowerCase(),
  );

  return fila ? `CL ${talla} · US ${fila.tallaUs} · EU ${fila.tallaEu}` : talla;
}
