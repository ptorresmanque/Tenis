import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DisponibilidadService } from '../catalogo-canchas/disponibilidad.service';
import { fechaDelClub } from '../comun/tiempo';
import { MotivoBloqueo, type Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CierreDeCanchaService } from '../reservas/cierre-de-cancha.service';
import { PrograMacionPedida } from './programacion.dto';
import { chocaConAlguna, enPalabras } from './restricciones';

/**
 * Poner un partido en una cancha y a una hora.
 *
 * **Programar crea un `Bloqueo` con motivo `TORNEO`**, y ahí está el atajo que hace que
 * esto quepa en una tarea en vez de un módulo. `catalogo-canchas` ya tiene la máquina y
 * `clases` la usa igual; las consecuencias salen gratis:
 *
 * - Ningún socio puede reservar sobre un partido programado, porque la disponibilidad
 *   ya respeta los bloqueos. **No hay una línea de código para eso.**
 * - Dos partidos no caen en la misma cancha a la misma hora, por lo mismo.
 * - Desprogramar borra el bloqueo y libera la cancha.
 *
 * Por eso `torneos` **no le habla a `reservas`**: toda la coordinación pasa por
 * `Bloqueo`, que es donde `reservas` ya mira. Una consulta directa sería una segunda
 * fuente de verdad sobre si una cancha está ocupada, y la primera vez que discrepen
 * alguien pierde su hora.
 */
@Injectable()
export class ProgramacionDePartidos {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cierres: CierreDeCanchaService,
    private readonly disponibilidad: DisponibilidadService,
  ) {}

  /**
   * Programa un partido. **Rechaza por cuatro razones y dice cuál.**
   *
   * "No se puede" obliga al admin a adivinar; "Pedro Soto no juega los martes de 18:00
   * a 21:00" le dice qué mover.
   */
  async programar(partidoId: number, datos: PrograMacionPedida) {
    const partido = await this.elPartido(partidoId);

    // 1. **Sin los dos jugadores no se programa.** No se le pone hora a un partido
    // cuya semifinal anterior no se jugó; es el mismo criterio que cargar un resultado.
    if (partido.jugadorAId === null || partido.jugadorBId === null) {
      throw new BadRequestException(
        'Ese partido todavía no tiene sus dos jugadores: no se puede programar.',
      );
    }

    // 2. La restricción horaria de cualquiera de los dos.
    await this.exigirQuePuedanJugar(partido, datos);

    // 3 y 4. La cancha abierta y libre. Las dos las comprueba el mismo camino que usa
    // `clases`: el rango tiene que caer entero dentro del horario de apertura y no
    // pisar otro bloqueo.
    await this.exigirRangoUsable(datos, partido.bloqueoId);

    const viejo = partido.bloqueoId;

    const { bloqueoId } = await this.cierres.cerrar(
      this.comoBloqueo(partido, datos),
      async (tx, bloqueo) => {
        await tx.partido.update({
          where: { id: partidoId },
          data: {
            programadoInicio: datos.inicio,
            programadoFin: datos.fin,
            bloqueoId: bloqueo,
          },
        });

        // El bloqueo viejo se borra **dentro de la misma transacción** que crea el
        // nuevo, como en `clases.mover`: si no, la cancha queda cerrada en dos horas
        // por un partido que solo se juega en una.
        if (viejo !== null) await tx.bloqueo.delete({ where: { id: viejo } });
      },
    );

    return { id: partidoId, bloqueoId };
  }

  /**
   * Le quita la hora a un partido y **libera la cancha**.
   *
   * Una cancha tomada por un partido que ya no se juega es una hora que el club pierde
   * sin darse cuenta.
   */
  async desprogramar(partidoId: number): Promise<{ id: number }> {
    const partido = await this.elPartido(partidoId);

    if (partido.bloqueoId === null) {
      throw new ConflictException('Ese partido no está programado.');
    }

    await this.liberar(this.prisma, partidoId, partido.bloqueoId);

    return { id: partidoId };
  }

  /**
   * Suelta la cancha de un partido, en la transacción que le pasen.
   *
   * Lo usa `resultados` al deshacer un avance: un partido que deja de existir no puede
   * seguir teniendo una cancha reservada.
   */
  async liberar(
    db: PrismaService | Prisma.TransactionClient,
    partidoId: number,
    bloqueoId: number,
  ): Promise<void> {
    await db.partido.update({
      where: { id: partidoId },
      data: { programadoInicio: null, programadoFin: null, bloqueoId: null },
    });

    await db.bloqueo.delete({ where: { id: bloqueoId } });
  }

  /**
   * Ninguno de los dos puede haber dicho que a esa hora no juega.
   *
   * **Basta con que se solapen**: un partido de 20:00 a 22:00 contra "no puedo de 21:00
   * a 23:00" es un partido que esa persona no va a terminar, y programarlo igual es
   * programar un walkover. Ver `restricciones.ts`.
   */
  private async exigirQuePuedanJugar(
    partido: {
      torneoId: number;
      jugadorAId: number | null;
      jugadorBId: number | null;
    },
    datos: PrograMacionPedida,
  ): Promise<void> {
    const inscripciones = await this.prisma.inscripcionTorneo.findMany({
      where: {
        torneoId: partido.torneoId,
        jugadorId: { in: [partido.jugadorAId!, partido.jugadorBId!] },
      },
      select: {
        jugador: { select: { nombre: true, apellido: true } },
        restricciones: {
          select: { diaSemana: true, horaDesde: true, horaHasta: true },
        },
      },
    });

    const cuando = {
      // **El día sale de la fecha civil del club, no del instante UTC.**
      //
      // `inicio` es un instante y Chile va tres o cuatro horas atrás, así que desde las
      // 21:00 locales el instante ya cae en el día siguiente en UTC: un partido de un
      // martes a las 21:00 se leía como miércoles y **la restricción de ese martes no
      // se encontraba**. Y la ventana rota era justo la tarde-noche, que es cuando el
      // club programa entre semana y cuando la gente pone sus restricciones por
      // trabajo. `fechaDelClub` devuelve la medianoche UTC del día civil, así que su
      // `getUTCDay()` es el día que la persona quiso decir.
      diaSemana: fechaDelClub(datos.fecha).getUTCDay(),
      horaDesde: datos.horaDesde,
      horaHasta: datos.horaHasta,
    };

    for (const inscripcion of inscripciones) {
      const choque = chocaConAlguna(inscripcion.restricciones, cuando);

      if (choque) {
        // **El mensaje nombra al jugador y la franja.** Es lo que convierte un rechazo
        // en algo que el admin puede resolver sin abrir otra pantalla.
        throw new ConflictException(
          `${inscripcion.jugador.nombre} ${inscripcion.jugador.apellido} no juega ${enPalabras(choque)}.`,
        );
      }
    }
  }

  /**
   * La cancha abierta a esa hora y sin nada encima.
   *
   * Es el mismo camino de `clases`: el rango tiene que caer **entero** dentro de los
   * bloques de apertura —media hora suelta al final sería una cancha cerrada en una
   * hora que la grilla sigue ofreciendo— y no pisar otro bloqueo.
   */
  private async exigirRangoUsable(
    datos: PrograMacionPedida,
    exceptoBloqueoId: number | null,
  ): Promise<void> {
    const bloques = await this.disponibilidad.de(datos.canchaId, datos.fecha);
    const dentro = bloques.filter(
      (bloque) => bloque.inicio >= datos.inicio && bloque.fin <= datos.fin,
    );

    if (
      dentro.length === 0 ||
      dentro[0].inicio.getTime() !== datos.inicio.getTime() ||
      dentro[dentro.length - 1].fin.getTime() !== datos.fin.getTime()
    ) {
      throw new NotFoundException(
        'Esa cancha no está abierta en ese rango, o el rango no calza con sus bloques.',
      );
    }

    const choque = await this.prisma.bloqueo.findFirst({
      where: {
        canchaId: datos.canchaId,
        inicio: { lt: datos.fin },
        fin: { gt: datos.inicio },
        ...(exceptoBloqueoId === null ? {} : { id: { not: exceptoBloqueoId } }),
      },
      select: { motivo: true, descripcion: true },
    });

    if (choque) {
      throw new ConflictException(
        `Esa cancha ya está ocupada en ese rango: ${choque.descripcion ?? choque.motivo.toLowerCase()}.`,
      );
    }
  }

  private comoBloqueo(
    partido: {
      ronda: number;
      torneoCategoria: { categoriaJuego: { nombre: string } };
    },
    datos: PrograMacionPedida,
  ) {
    return {
      canchaId: datos.canchaId,
      inicio: datos.inicio,
      fin: datos.fin,
      motivo: MotivoBloqueo.TORNEO,
      // Lo que el club lee en la grilla al preguntarse por qué esa hora está cerrada.
      descripcion: `Torneo — ${partido.torneoCategoria.categoriaJuego.nombre}, ronda ${partido.ronda}`,
    };
  }

  private async elPartido(id: number) {
    const partido = await this.prisma.partido.findUnique({
      where: { id },
      select: {
        id: true,
        torneoId: true,
        ronda: true,
        jugadorAId: true,
        jugadorBId: true,
        bloqueoId: true,
        torneoCategoria: {
          select: { categoriaJuego: { select: { nombre: true } } },
        },
      },
    });

    if (!partido) {
      throw new NotFoundException('No hay un partido con ese número.');
    }

    return partido;
  }
}
