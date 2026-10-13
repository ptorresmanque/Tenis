import { BadRequestException, ConflictException } from '@nestjs/common';

import { ZONA_DEL_CLUB } from '../comun/tiempo';
import { EstadoClase, Prisma, TipoClase } from '../generated/prisma/client';

/** Lo que dice la pantalla donde una clase de tenis dice su cancha (A7). */
export const GIMNASIO = 'Gimnasio';

const HORA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Por qué una clase de preparación física no cabe en el gimnasio, o `null` si cabe (T231,
 * `SPEC-clases.md` § Reglas): el cupo pasa el de una grupal, u otra clase se cruza.
 *
 * **Con `conCandado`, va adentro de la transacción que escribe, y antes que cualquier otra
 * lectura.** Toma la fila de `configuracion_club` con `FOR UPDATE`, como el tope de luz: sin
 * eso, dos clases pedidas a la vez para la misma hora no ven ninguna a la otra y entran las
 * dos. El cruce se lee después con una lectura común, que en `REPEATABLE READ` saca su foto
 * en ese momento: ya ve la clase de quien soltó el candado.
 *
 * Sin candado sirve para avisar antes de escribir —la simulación—, nunca para decidir.
 *
 * @param clase El cupo viaja al agendar; al mover no, porque mover no cambia el cupo y una
 * clase agendada antes de que el club bajara el tope tiene que poder cambiar de hora.
 */
export async function problemaDelGimnasio(
  db: Prisma.TransactionClient,
  clase: { inicio: Date; fin: Date; cupoMaximo?: number },
  {
    exceptoClaseId = null,
    conCandado = false,
  }: { exceptoClaseId?: number | null; conCandado?: boolean } = {},
): Promise<BadRequestException | ConflictException | null> {
  const [configuracion] = await db.$queryRaw<{ cupo: number }[]>`
    SELECT gimnasio_cupo_grupal AS cupo FROM configuracion_club WHERE id = 1
    ${conCandado ? Prisma.sql`FOR UPDATE` : Prisma.empty}`;
  const tope = Number(configuracion?.cupo);

  if (clase.cupoMaximo !== undefined && clase.cupoMaximo > tope) {
    return new BadRequestException(
      `Una clase grupal del gimnasio es de hasta ${tope} alumnos: el club lo cambia en la configuración del gimnasio.`,
    );
  }

  const otra = await db.clase.findFirst({
    where: {
      tipo: TipoClase.PREPARACION_FISICA,
      estado: EstadoClase.PROGRAMADA,
      inicio: { lt: clase.fin },
      fin: { gt: clase.inicio },
      ...(exceptoClaseId === null ? {} : { id: { not: exceptoClaseId } }),
    },
    select: {
      inicio: true,
      fin: true,
      profesor: { select: { nombreVisible: true } },
    },
  });

  if (!otra) return null;

  return new ConflictException({
    motivo: 'GIMNASIO_OCUPADO',
    message:
      `El gimnasio ya tiene una clase de ${HORA.format(otra.inicio)} a ` +
      `${HORA.format(otra.fin)}, con ${otra.profesor.nombreVisible}: es una a la vez.`,
  });
}
