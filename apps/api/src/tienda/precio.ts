import type { Prisma } from '../generated/prisma/client';
import type { UsuarioActual } from '../identidad/usuario-actual';

/**
 * El descuento de socio de una unidad, redondeado al peso y a medias hacia arriba
 * (`SPEC-tienda.md` § Precio y descuento de socio). En enteros: `precio × % / 100` con
 * floats deja un 1.498,5 como 1.498,4999… y lo redondea para abajo.
 */
export function descuentoUnitario(
  precioClp: number,
  porcentaje: number,
): number {
  return Math.floor((precioClp * porcentaje + 50) / 100);
}

/** Lo que paga el socio por una unidad. Nunca cero: eso sería regalarla. */
export function precioDeSocio(precioClp: number, porcentaje: number): number {
  return Math.max(1, precioClp - descuentoUnitario(precioClp, porcentaje));
}

/**
 * El porcentaje de quien mira, o nulo si no le toca: **solo el socio activo y al día**
 * (`SPEC-tienda.md` § Quién lo recibe). Lo usan el catálogo y el carrito, para que la
 * regla esté una vez.
 */
export async function porcentajeDeSocio(
  db: Prisma.TransactionClient,
  yo: UsuarioActual | null,
): Promise<number | null> {
  if (!yo?.socioActivo || !yo.socioAlDia) return null;

  const { descuentoSocioPorcentaje } =
    await db.configuracionClub.findFirstOrThrow({
      select: { descuentoSocioPorcentaje: true },
    });

  return descuentoSocioPorcentaje;
}
