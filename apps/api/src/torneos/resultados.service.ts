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
    const cadena = await this.cadenaAguasAbajo(this.prisma, torneoId, partido);

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
          : await this.cadenaAguasAbajo(tx, torneoId, partido);

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
          },
        });
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

      await this.colocarEnLaSiguiente(
        tx,
        torneoId,
        partido,
        resultado.ganadorId,
      );

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
    torneoId: number,
    partido: { ronda: number; posicion: number },
    ganadorId: number,
  ): Promise<void> {
    const destino = avanceDe(partido.ronda, partido.posicion);

    const siguiente = await tx.partido.findUnique({
      where: {
        torneoId_ronda_posicion: {
          torneoId,
          ronda: destino.ronda,
          posicion: destino.posicion,
        },
      },
      select: { id: true },
    });

    if (!siguiente) {
      await tx.torneo.update({
        where: { id: torneoId },
        data: { estado: EstadoTorneo.FINALIZADO },
      });

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
   * Los partidos que cuelgan de este, ronda por ronda hasta la final.
   *
   * Una sola función para contar y para limpiar: son el mismo recorrido, y tenerlo dos
   * veces es tenerlo mal una de las dos cuando el cuadro cambie.
   *
   * No se recorre el cuadro entero: los partidos de la otra mitad no tienen nada que
   * ver con este error y se están jugando.
   */
  private async cadenaAguasAbajo(
    db: PrismaService | Prisma.TransactionClient,
    torneoId: number,
    desde: { ronda: number; posicion: number },
  ) {
    const cadena: {
      id: number;
      ronda: number;
      posicion: number;
      ganadorId: number | null;
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
          torneoId_ronda_posicion: {
            torneoId,
            ronda: destino.ronda,
            posicion: destino.posicion,
          },
        },
        select: { id: true, ronda: true, posicion: true, ganadorId: true },
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
