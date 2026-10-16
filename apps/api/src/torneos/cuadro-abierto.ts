import { hoyEnElClub } from '../comun/tiempo';
import {
  EstadoInscripcionTorneo,
  EstadoTorneo,
  type Prisma,
} from '../generated/prisma/client';

/**
 * El candado de una categoría: el mismo para toda escritura sobre su cupo (inscribirse,
 * promover, ofrecer los cupos de la lista de espera).
 *
 * `FOR UPDATE` sobre `torneo_categoria` y no sobre `torneo`: el cupo es de la categoría, y
 * serializar por torneo pondría a los de Honor en fila detrás de los de la 4ª sin razón. Va por
 * SQL crudo porque Prisma no expone `FOR UPDATE`; el id viaja parametrizado.
 */
export async function tomarElCandado(
  tx: Prisma.TransactionClient,
  torneoCategoriaId: number,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM torneo_categoria WHERE id = ${torneoCategoriaId} FOR UPDATE`;
}

/**
 * Las inscripciones que ocupan un lugar del cuadro: las de adentro y las de la lista de espera
 * con un cupo ofrecido (T331, LE3).
 *
 * **La oferta cuenta aunque haya vencido**, hasta que el cron la retira: es el cron el que pasa
 * el turno, y espera a que se resuelva un pago de Webpay en curso (E6). Si dejara de contar al
 * vencer, el lugar se vería libre mientras la persona está pagando.
 */
export const OCUPA_CUPO = {
  OR: [
    { estado: EstadoInscripcionTorneo.INSCRITA },
    {
      estado: EstadoInscripcionTorneo.LISTA_ESPERA,
      cupoOfrecidoHasta: { not: null },
    },
  ],
} satisfies Prisma.InscripcionTorneoWhereInput;

/**
 * Por qué una categoría ya no acepta inscritos, o nulo si los acepta.
 *
 * Lo comparten inscribirse, que lo dice con estas palabras, y la lista de espera, que con
 * cualquiera de las tres razones deja de ofrecer cupos (`SPEC-torneos.md` § Lista de espera sin
 * cobro, E3): lo que quede lo resuelve el admin con «Promover».
 */
export function porQueNoAcepta(cuadro: {
  semillaSorteo: number | null;
  categoriaJuego: { nombre: string };
  torneo: { estado: EstadoTorneo; cierreInscripcion: Date };
}): string | null {
  if (cuadro.semillaSorteo !== null) {
    return `El cuadro de ${cuadro.categoriaJuego.nombre} ya está armado: no acepta más inscritos.`;
  }

  if (cuadro.torneo.estado === EstadoTorneo.CANCELADO) {
    return 'Ese torneo está cancelado.';
  }

  // El último día de inscripción cuenta entero, como `alDiaHasta` en identidad: la fecha del
  // papel es la última que vale.
  if (cuadro.torneo.cierreInscripcion < hoyEnElClub()) {
    return 'La inscripción de ese torneo ya se cerró.';
  }

  return null;
}
