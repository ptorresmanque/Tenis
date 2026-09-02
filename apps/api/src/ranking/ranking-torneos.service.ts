import { Injectable } from '@nestjs/common';

import { comoFechaCivil, hoyEnElClub } from '../comun/tiempo';
import { EstadoTorneo } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FilaDeRanking, tablaDeRanking } from './puntos';

/**
 * Un **cuadro** que la tabla está contando. Se publica para poder explicarla.
 *
 * Un cuadro y no un torneo (T70): una Copa que corre 5ª, 4ª y Honor aporta tres
 * campeones y tres juegos de puntos, y quien mira la tabla tiene que poder ver cuál de
 * los tres le dio los suyos.
 */
export interface CuadroContado {
  id: number;
  torneoId: number;
  nombre: string;
  /** El nivel: "4ª", "Honor". */
  categoria: string;
  /** Cuánto valía ganarlo: "Club 250". */
  valor: string;
  fechaFin: string;
}

export interface TablaDeTorneos {
  /**
   * El corte: solo suman los torneos que terminaron desde este día.
   *
   * **No hay un `hasta`, y es a propósito.** La ventana tiene un solo borde: un torneo
   * que se terminó de jugar antes de su fecha de cierre repartió sus puntos igual, y
   * dejarlo fuera hasta que llegue el día sería esconder algo que ya pasó. Un `hasta`
   * en la respuesta prometía un tope que la consulta no aplica.
   */
  desde: string;
  torneos: CuadroContado[];
  posiciones: FilaDeRanking[];
}

/**
 * Cincuenta y dos semanas, en días.
 *
 * En días y no en meses porque un mes no dura siempre lo mismo y el corte tiene que
 * poder explicarse: "desde el 26 de agosto" es una respuesta, "hace un año más o
 * menos" no lo es.
 */
const DIAS_DE_LA_VENTANA = 52 * 7;

/**
 * El ranking de torneos.
 *
 * **Los puntos caducan solos.** Nadie los borra y no hay un proceso que pueda no haber
 * corrido: la consulta mira los torneos de las últimas 52 semanas y los de antes
 * quedan afuera por no estar en el rango, no por haberse limpiado.
 *
 * Eso trae una consecuencia que la pantalla tiene que decir: **el ranking cambia sin
 * que pase nada**. Un lunes cualquiera alguien baja tres puestos porque caducó el
 * torneo del año pasado. Por eso la respuesta lleva el corte y la lista de torneos que
 * está contando, y no solo las posiciones.
 */
@Injectable()
export class RankingDeTorneos {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La tabla al día de hoy.
   *
   * @param hoy El día del club. Parámetro y no `new Date()` adentro para que el corte
   *            se pueda probar sin esperar un año.
   */
  async tabla(hoy: Date = hoyEnElClub()): Promise<TablaDeTorneos> {
    const desde = new Date(hoy);
    desde.setUTCDate(desde.getUTCDate() - DIAS_DE_LA_VENTANA);

    // **La unidad es el cuadro, no el torneo** (T70). Un torneo con tres categorías
    // reparte tres juegos de puntos, uno por cada final, y cada uno vale lo que diga su
    // propia categoría: el campeón de Honor puede sumar el doble que el de 5ª.
    const cuadros = await this.prisma.torneoCategoria.findMany({
      // **Solo los de torneos `FINALIZADO`.** Un torneo a medias no reparte puntos de
      // campeón, y uno cancelado no se jugó: darle puntos sería premiar algo que no
      // ocurrió.
      //
      // Un solo borde: `gte` y nada de `lte`. El que se terminó de jugar antes de su
      // fecha prevista ya repartió sus puntos, y esconderlos hasta que llegue el día
      // sería negar un torneo que el club vio jugarse.
      where: {
        torneo: { estado: EstadoTorneo.FINALIZADO, fechaFin: { gte: desde } },
      },
      orderBy: [
        { torneo: { fechaFin: 'desc' } },
        { torneo: { id: 'desc' } },
        { id: 'desc' },
      ],
      select: {
        id: true,
        torneoId: true,
        torneo: { select: { nombre: true, fechaFin: true } },
        categoriaJuego: { select: { nombre: true } },
        categoria: { select: { nombre: true, puntosCampeon: true } },
        // Todos los partidos del cuadro en la misma consulta: el motor necesita el
        // cuadro entero para saber cuántas rondas tuvo y quién ganó la final.
        partidos: {
          select: {
            ronda: true,
            jugadorAId: true,
            jugadorBId: true,
            ganadorId: true,
          },
        },
      },
    });

    return {
      desde: comoFechaCivil(desde),
      torneos: cuadros.map((cuadro) => ({
        id: cuadro.id,
        torneoId: cuadro.torneoId,
        nombre: cuadro.torneo.nombre,
        categoria: cuadro.categoriaJuego.nombre,
        valor: cuadro.categoria.nombre,
        fechaFin: comoFechaCivil(cuadro.torneo.fechaFin),
      })),
      posiciones: tablaDeRanking(
        cuadros.map((cuadro) => ({
          puntosCampeon: cuadro.categoria.puntosCampeon,
          partidos: cuadro.partidos,
        })),
        await this.nombresDe(cuadros),
      ),
    };
  }

  /**
   * Cómo se llama cada jugador que aparece en esos cuadros.
   *
   * En una sola consulta y no una por jugador: son decenas de nombres y el N+1 acá se
   * paga en cada carga de una pantalla pública.
   *
   * **Solo el nombre.** El teléfono de un jugador lo tiene el club para llamarlo, no
   * para publicarlo, y esta tabla se mira desde la calle.
   */
  private async nombresDe(
    cuadros: {
      partidos: { jugadorAId: number | null; jugadorBId: number | null }[];
    }[],
  ): Promise<Map<number, string>> {
    const ids = new Set<number>();
    for (const cuadro of cuadros) {
      for (const partido of cuadro.partidos) {
        if (partido.jugadorAId !== null) ids.add(partido.jugadorAId);
        if (partido.jugadorBId !== null) ids.add(partido.jugadorBId);
      }
    }

    const jugadores = await this.prisma.jugador.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, nombre: true, apellido: true },
    });

    return new Map(
      jugadores.map((jugador) => [
        jugador.id,
        `${jugador.nombre} ${jugador.apellido}`,
      ]),
    );
  }
}
