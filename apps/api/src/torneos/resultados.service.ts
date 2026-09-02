import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EstadoTorneo, type Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { avanceDe } from './cuadro';

/** Lo que el admin carga de un partido. */
export interface ResultadoCargado {
  ganadorId: number;
  marcador: string | null;
  walkover: boolean;
}

/**
 * Los resultados del cuadro.
 *
 * Cargar un resultado hace **dos** cosas: guarda quién ganó y mueve al ganador al
 * partido que le toca. Que avance solo es lo que hace que el cuadro del mural esté al
 * día sin que nadie lo copie a mano.
 *
 * **El walkover cuenta como partido ganado.** Es el criterio ATP y evita la injusticia
 * mayor: quien llegó a semifinales porque su rival no se presentó jugó y ganó los
 * partidos anteriores, y no darle los puntos de la ronda alcanzada lo castiga por algo
 * que hizo otro.
 */
@Injectable()
export class ResultadosDelCuadro {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cuántos partidos se deshacen si se corrige este resultado.
   *
   * **Se consulta antes de corregir, no después.** Cambiar al ganador de semifinales
   * borra la final que ya se jugó, y eso el admin tiene que verlo escrito antes de
   * apretar; es el mismo paso previo que el cierre de una cancha.
   */
  async consecuencias(
    torneoId: number,
    partidoId: number,
  ): Promise<{ deshace: number }> {
    const partido = await this.elPartido(this.prisma, torneoId, partidoId);
    const cadena = await this.cadenaAguasAbajo(
      this.prisma,
      partido.torneoCategoriaId,
      partido,
    );

    return {
      deshace: cadena.filter((eslabon) => eslabon.ganadorId !== null).length,
    };
  }

  /**
   * Carga el resultado y avanza al ganador.
   *
   * Si el partido ya estaba resuelto, **limpia lo que venía después**: si el admin se
   * equivocó de ganador en semifinales, la final no puede quedar con el jugador
   * equivocado esperando.
   */
  async cargar(
    torneoId: number,
    partidoId: number,
    resultado: ResultadoCargado,
  ): Promise<{ id: number; deshechos: number }> {
    return this.prisma.$transaction(async (tx) => {
      const torneo = await tx.torneo.findUnique({
        where: { id: torneoId },
        select: { estado: true },
      });

      // **Un torneo cancelado no acepta resultados**: se canceló, no se jugó, y un
      // partido cargado ahí repartiría puntos de algo que no ocurrió. El finalizado sí
      // los acepta: corregir el ganador de una final ya jugada es justo para lo que
      // existe la corrección.
      if (torneo?.estado === EstadoTorneo.CANCELADO) {
        throw new ConflictException(
          'Ese torneo está cancelado: no se le cargan resultados.',
        );
      }

      const partido = await this.elPartido(tx, torneoId, partidoId);

      // **Un partido sin los dos jugadores no acepta resultado.** Es el error que deja
      // un cuadro contando los puntos de un partido que no se jugó.
      if (partido.jugadorAId === null || partido.jugadorBId === null) {
        throw new BadRequestException(
          'Ese partido todavía no tiene sus dos jugadores.',
        );
      }

      if (
        resultado.ganadorId !== partido.jugadorAId &&
        resultado.ganadorId !== partido.jugadorBId
      ) {
        throw new BadRequestException(
          'El ganador tiene que ser uno de los dos que juegan ese partido.',
        );
      }

      // El avance viejo se borra antes de escribir el nuevo: si el admin se
      // equivocó de ganador en semifinales, la final no puede quedar con el jugador
      // equivocado esperando.
      const cadena =
        partido.ganadorId === null
          ? []
          : await this.cadenaAguasAbajo(tx, partido.torneoCategoriaId, partido);

      for (const eslabon of cadena) {
        await tx.partido.update({
          where: { id: eslabon.id },
          data: {
            ...(eslabon.lado === 'A'
              ? { jugadorAId: null }
              : { jugadorBId: null }),
            ganadorId: null,
            marcador: null,
            walkover: false,
            jugadoEn: null,
            programadoInicio: null,
            programadoFin: null,
            bloqueoId: null,
          },
        });

        // **Y se suelta su cancha.** Un partido que deja de existir no puede seguir
        // teniendo una hora reservada: sería una hora que el club pierde sin darse
        // cuenta, y que ningún socio puede tomar porque el bloqueo sigue ahí.
        if (eslabon.bloqueoId !== null) {
          await tx.bloqueo.delete({ where: { id: eslabon.bloqueoId } });
        }
      }

      const deshechos = cadena.filter(
        (eslabon) => eslabon.ganadorId !== null,
      ).length;

      // **Un torneo finalizado cuya final se acaba de deshacer ya no está
      // finalizado.** Si no, queda diciendo que tiene campeón mientras la final
      // espera resultado, y de ese estado salen los puntos del ranking.
      if (deshechos > 0) {
        await tx.torneo.updateMany({
          where: { id: torneoId, estado: EstadoTorneo.FINALIZADO },
          data: { estado: EstadoTorneo.CUADRO_ARMADO },
        });
      }

      await tx.partido.update({
        where: { id: partidoId },
        data: {
          ganadorId: resultado.ganadorId,
          marcador: resultado.marcador,
          walkover: resultado.walkover,
          jugadoEn: new Date(),
        },
      });

      await this.colocarEnLaSiguiente(tx, partido, resultado.ganadorId);

      return { id: partidoId, deshechos };
    });
  }

  /**
   * Pone al ganador en el partido que le toca.
   *
   * Si no hay ronda siguiente, este era la final: el torneo pasa a `FINALIZADO`. **Ahí,
   * y no antes**, sus resultados pueden entrar al ranking: un torneo a medias no
   * reparte puntos de campeón.
   */
  private async colocarEnLaSiguiente(
    tx: Prisma.TransactionClient,
    partido: {
      torneoId: number;
      torneoCategoriaId: number;
      ronda: number;
      posicion: number;
    },
    ganadorId: number,
  ): Promise<void> {
    const destino = avanceDe(partido.ronda, partido.posicion);

    const siguiente = await tx.partido.findUnique({
      where: {
        torneoCategoriaId_ronda_posicion: {
          torneoCategoriaId: partido.torneoCategoriaId,
          ronda: destino.ronda,
          posicion: destino.posicion,
        },
      },
      select: { id: true },
    });

    if (!siguiente) {
      // Era la final **de este cuadro**. El torneo no termina por eso: termina cuando
      // terminan todos, y un torneo con Honor coronado y la 4ª en semifinales sigue en
      // curso. De `FINALIZADO` salen los puntos del ranking, así que ponerlo antes
      // repartiría puntos de un torneo a medias.
      if (await this.todosLosCuadrosTerminaron(tx, partido.torneoId)) {
        await tx.torneo.update({
          where: { id: partido.torneoId },
          data: { estado: EstadoTorneo.FINALIZADO },
        });
      }

      return;
    }

    await tx.partido.update({
      where: { id: siguiente.id },
      data:
        destino.lado === 'A'
          ? { jugadorAId: ganadorId }
          : { jugadorBId: ganadorId },
    });
  }

  /**
   * ¿Terminaron **todos** los cuadros del torneo?
   *
   * Un cuadro terminó cuando su ronda más alta —su final— tiene ganador. Un cuadro sin
   * partidos todavía no empezó, así que el torneo no puede estar terminado.
   *
   * Se resuelve con una consulta y no con una por cuadro: son tres o cuatro cuadros con
   * menos de 128 partidos entre todos, y el N+1 acá costaría más código que datos.
   */
  private async todosLosCuadrosTerminaron(
    tx: Prisma.TransactionClient,
    torneoId: number,
  ): Promise<boolean> {
    const cuadros = await tx.torneoCategoria.findMany({
      where: { torneoId },
      select: { partidos: { select: { ronda: true, ganadorId: true } } },
    });

    return (
      cuadros.length > 0 &&
      cuadros.every(({ partidos }) => {
        if (partidos.length === 0) return false;

        const final = Math.max(...partidos.map((partido) => partido.ronda));

        return partidos
          .filter((partido) => partido.ronda === final)
          .every((partido) => partido.ganadorId !== null);
      })
    );
  }

  /**
   * Los partidos que cuelgan de este, ronda por ronda hasta la final.
   *
   * Una sola función para contar y para limpiar: son el mismo recorrido, y tenerlo dos
   * veces es tenerlo mal una de las dos cuando el cuadro cambie.
   *
   * No se recorre el cuadro entero: los partidos de la otra mitad no tienen nada que
   * ver con este error y se están jugando. Y **no se sale del cuadro**: el avance vive
   * dentro de su categoría, así que corregir una semifinal de Honor no puede tocar la
   * final de la 4ª.
   */
  private async cadenaAguasAbajo(
    db: PrismaService | Prisma.TransactionClient,
    torneoCategoriaId: number,
    desde: { ronda: number; posicion: number },
  ) {
    const cadena: {
      id: number;
      ronda: number;
      posicion: number;
      ganadorId: number | null;
      bloqueoId: number | null;
      lado: 'A' | 'B';
    }[] = [];
    let actual = desde;

    for (;;) {
      const destino = avanceDe(actual.ronda, actual.posicion);
      // Por la clave compuesta y no con un `findFirst`: es única y así se busca en el
      // resto del archivo. La misma consulta escrita de dos formas es una que alguien
      // va a cambiar en un lugar y no en el otro.
      const siguiente = await db.partido.findUnique({
        where: {
          torneoCategoriaId_ronda_posicion: {
            torneoCategoriaId,
            ronda: destino.ronda,
            posicion: destino.posicion,
          },
        },
        select: {
          id: true,
          ronda: true,
          posicion: true,
          ganadorId: true,
          bloqueoId: true,
        },
      });

      if (!siguiente) return cadena;

      cadena.push({ ...siguiente, lado: destino.lado });
      actual = siguiente;
    }
  }

  private async elPartido(
    db: PrismaService | Prisma.TransactionClient,
    torneoId: number,
    partidoId: number,
  ) {
    const partido = await db.partido.findFirst({
      where: { id: partidoId, torneoId },
      select: {
        id: true,
        torneoId: true,
        torneoCategoriaId: true,
        ronda: true,
        posicion: true,
        jugadorAId: true,
        jugadorBId: true,
        ganadorId: true,
      },
    });

    if (!partido) {
      throw new NotFoundException(
        'No hay un partido con ese número en este torneo.',
      );
    }

    return partido;
  }
}
