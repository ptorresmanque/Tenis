import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';

/** Una variante como la escribe el admin al crearla (T158). */
export interface VarianteNueva {
  etiqueta: string;
  codigoBarras: string | null;
  /** Con lo que nace. Entra como un movimiento `ENTRADA`, nunca escrito directo. */
  stock: number;
}

/** Un producto como lo escribe el admin al crearlo. */
export interface ProductoNuevo {
  nombre: string;
  descripcion: string;
  categoriaId: number;
  marcaId: number | null;
  precioClp: number;
  variantes: VarianteNueva[];
}

/** Lo que se le cambia a un producto. El stock y las variantes van por su lado. */
export type CambioDeProducto = Partial<
  Omit<ProductoNuevo, 'variantes'> & { publicado: boolean; archivado: boolean }
>;

/** Lo que se le cambia a una variante. **El stock no**: va por una entrada o un ajuste. */
export type CambioDeVariante = Partial<{
  etiqueta: string;
  codigoBarras: string | null;
  activa: boolean;
}>;

export type EstadoDeProducto = 'borrador' | 'publicado' | 'archivado';

/** Los anchos de las columnas de `producto` y `variante`. */
const LARGO_DEL_NOMBRE = 120;
const LARGO_DE_LA_DESCRIPCION = 4000;
const LARGO_DE_LA_ETIQUETA = 40;
const LARGO_DEL_CODIGO = 64;

/** Diez millones: más que la raqueta más cara, y lo justo para atajar un cero de más. */
const PRECIO_MAXIMO = 10_000_000;
/** El stock con que nace una variante. Más es un dedazo, no una bodega. */
const STOCK_INICIAL_MAXIMO = 100_000;
/** Las variantes de un producto: una zapatilla con medias tallas anda por 20. */
const VARIANTES_MAXIMAS = 100;

export function leerProductoNuevo(cuerpo: unknown): ProductoNuevo {
  const datos = objeto(cuerpo);
  const variantes = datos.variantes === undefined ? [] : lista(datos.variantes);

  if (variantes.length > VARIANTES_MAXIMAS) {
    throw new BadRequestException(
      `Un producto lleva hasta ${VARIANTES_MAXIMAS} variantes.`,
    );
  }

  const leidas = variantes.map(leerVarianteNueva);
  sinRepetir(
    leidas.map((v) => v.etiqueta),
    (e) => `La variante "${e}" está dos veces.`,
  );
  sinRepetir(
    leidas.flatMap((v) => (v.codigoBarras ? [v.codigoBarras] : [])),
    (c) => `El código de barras ${c} está en dos variantes.`,
  );

  return {
    nombre: texto(datos.nombre, 'el nombre del producto', LARGO_DEL_NOMBRE),
    descripcion:
      datos.descripcion === undefined
        ? ''
        : texto(
            datos.descripcion,
            'la descripción',
            LARGO_DE_LA_DESCRIPCION,
            false,
          ),
    categoriaId: entero(datos.categoriaId, 'La categoría', 1),
    marcaId:
      datos.marcaId == null ? null : entero(datos.marcaId, 'La marca', 1),
    precioClp: precio(datos.precioClp),
    variantes: leidas,
  };
}

export function leerVarianteNueva(cuerpo: unknown): VarianteNueva {
  const datos = objeto(cuerpo);

  return {
    etiqueta: texto(
      datos.etiqueta,
      'la etiqueta de la variante',
      LARGO_DE_LA_ETIQUETA,
    ),
    codigoBarras: codigo(datos.codigoBarras),
    stock:
      datos.stock === undefined
        ? 0
        : entero(datos.stock, 'El stock inicial', 0, STOCK_INICIAL_MAXIMO),
  };
}

/** Solo lo que vino. Publicar y archivar a la vez es una contradicción, no un cambio. */
export function leerCambioDeProducto(cuerpo: unknown): CambioDeProducto {
  const datos = objeto(cuerpo);
  const cambio: CambioDeProducto = {};

  if (datos.nombre !== undefined) {
    cambio.nombre = texto(
      datos.nombre,
      'el nombre del producto',
      LARGO_DEL_NOMBRE,
    );
  }
  if (datos.descripcion !== undefined) {
    cambio.descripcion = texto(
      datos.descripcion,
      'la descripción',
      LARGO_DE_LA_DESCRIPCION,
      false,
    );
  }
  if (datos.categoriaId !== undefined) {
    cambio.categoriaId = entero(datos.categoriaId, 'La categoría', 1);
  }
  if (datos.marcaId !== undefined) {
    cambio.marcaId =
      datos.marcaId === null ? null : entero(datos.marcaId, 'La marca', 1);
  }
  if (datos.precioClp !== undefined) cambio.precioClp = precio(datos.precioClp);
  if (datos.publicado !== undefined)
    cambio.publicado = siONo(datos.publicado, 'Publicado');
  if (datos.archivado !== undefined)
    cambio.archivado = siONo(datos.archivado, 'Archivado');

  if (cambio.publicado === true && cambio.archivado === true) {
    throw new BadRequestException(
      'Un producto no se publica y se archiva a la vez.',
    );
  }
  if (Object.keys(cambio).length === 0) {
    throw new BadRequestException('No viene ningún cambio.');
  }

  return cambio;
}

export function leerCambioDeVariante(cuerpo: unknown): CambioDeVariante {
  const datos = objeto(cuerpo);
  const cambio: CambioDeVariante = {};

  // Se rechaza y no se ignora: quien manda un stock cree que lo está cambiando.
  if (datos.stock !== undefined) {
    throw new BadRequestException(
      'El stock no se edita en la variante: se cambia con una entrada de mercadería o un ajuste.',
    );
  }
  if (datos.etiqueta !== undefined) {
    cambio.etiqueta = texto(
      datos.etiqueta,
      'la etiqueta de la variante',
      LARGO_DE_LA_ETIQUETA,
    );
  }
  if (datos.codigoBarras !== undefined)
    cambio.codigoBarras = codigo(datos.codigoBarras);
  if (datos.activa !== undefined) cambio.activa = siONo(datos.activa, 'Activa');

  if (Object.keys(cambio).length === 0) {
    throw new BadRequestException('No viene ningún cambio.');
  }

  return cambio;
}

/** El orden nuevo de las fotos: `{ ids: [3, 1, 2] }`, la primera es la portada. */
export function leerOrdenDeFotos(cuerpo: unknown): number[] {
  const { ids } = objeto(cuerpo);
  const leidos = lista(ids).map((id) => entero(id, 'Cada foto', 1));

  sinRepetir(leidos.map(String), () => 'Una foto está dos veces en el orden.');

  return leidos;
}

/** El filtro de la lista. Sin él, todo lo que no está archivado. */
export function leerEstado(valor: unknown): EstadoDeProducto | null {
  if (valor === undefined || valor === '') return null;
  if (valor === 'borrador' || valor === 'publicado' || valor === 'archivado')
    return valor;

  throw new BadRequestException(
    'El estado es borrador, publicado o archivado.',
  );
}

/** La categoría de la lista, como llega en la URL. */
export function leerCategoriaDeLaLista(valor: unknown): number | null {
  if (valor === undefined || valor === '') return null;

  return entero(Number(valor), 'La categoría', 1);
}

function objeto(cuerpo: unknown): Record<string, unknown> {
  return (cuerpo ?? {}) as Record<string, unknown>;
}

function lista(valor: unknown): unknown[] {
  if (!Array.isArray(valor))
    throw new BadRequestException('Se esperaba una lista.');

  return valor;
}

function texto(
  valor: unknown,
  campo: string,
  largo: number,
  obligatorio = true,
): string {
  const limpio = typeof valor === 'string' ? valor.trim() : '';

  if (obligatorio && !limpio) throw new BadRequestException(`Falta ${campo}.`);
  if (limpio.length > largo) {
    throw new BadRequestException(
      `Acorta ${campo}: tiene más de ${largo} caracteres.`,
    );
  }

  return limpio;
}

/** Vacío o nulo es "sin código". Sin espacios adentro: un lector no los escribe. */
function codigo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;

  const limpio = typeof valor === 'string' ? valor.trim() : '';
  if (!limpio) return null;
  if (limpio.length > LARGO_DEL_CODIGO || /\s/.test(limpio)) {
    throw new BadRequestException(
      `El código de barras va sin espacios y hasta ${LARGO_DEL_CODIGO} caracteres.`,
    );
  }

  return limpio;
}

function precio(valor: unknown): number {
  return entero(valor, 'El precio', 1, PRECIO_MAXIMO);
}

function siONo(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') {
    throw new BadRequestException(`${campo} tiene que ser sí o no.`);
  }

  return valor;
}

/**
 * Sin distinguir mayúsculas, como los únicos de la base: "M" y "m" chocan allá igual, y
 * acá se ataja con un mensaje que dice cuál.
 */
function sinRepetir(
  valores: string[],
  mensaje: (repetido: string) => string,
): void {
  const vistos = new Set<string>();

  for (const valor of valores) {
    const clave = valor.toLowerCase();
    if (vistos.has(clave)) throw new BadRequestException(mensaje(valor));
    vistos.add(clave);
  }
}
