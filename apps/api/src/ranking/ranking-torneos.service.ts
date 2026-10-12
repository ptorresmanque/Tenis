import { Injectable, NotFoundException } from '@nestjs/common';

import { comoFechaCivil } from '../comun/tiempo';
import { EstadoTorneo } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { COLUMNAS_DE_LA_TABLA, deColumnas } from '../tours/tabla';
import { CuadroTerminado, FilaDeRanking, tablaDeRanking } from './puntos';

/**
 * Un **cuadro** que la tabla está contando. Se publica para poder explicarla: "Copa
 * Aniversario · 4ª · Nivel 500 · terminó el 3 de mayo".
 */
export interface CuadroContado {
  id: number;
  torneoId: number;
  nombre: string;
  /** La categoría de juego: "4ª", "Honor". */
  categoria: string;
  /** El nivel con que el torneo entró a esta temporada: "500". */
  nivel: string;
  fechaFin: string;
}

export interface TablaDeTorneos {
  temporada: {
    id: number;
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
  };
  /**
   * Las categorías de juego **con filas** en esta temporada, de la más alta a la más
   * baja. Llenan el selector: una lista con categorías vacías obliga a probar una por una.
   */
  categorias: { id: number; nombre: string }[];
  /** La que se está mostrando: la pedida, o la más alta con filas. Nula sin ninguna. */
  categoriaId: number | null;
  torneos: CuadroContado[];
  posiciones: FilaDeRanking[];
}

/**
 * El ranking de torneos: **una tabla por tour, temporada y categoría de juego**
 * (`SPEC-ranking.md` § Ranking de torneos, rehecho en T198).
 *
 * La temporada reemplaza a la ventana de 52 semanas: suman los torneos `FINALIZADO`
 * asociados a un nivel de esa temporada, sin mirar sus fechas (D13). Los puntos no
 * caducan: la tabla de una temporada que terminó queda como estaba.
 *
 * **Deja de leer la categoría de torneo** (A3): los puntos salen de la tabla del nivel.
 */
@Injectable()
export class RankingDeTorneos {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param categoriaId La categoría de juego pedida. Sin ella, la más alta con filas.
   */
  async tabla(
    temporadaId: number,
    categoriaId: number | null = null,
  ): Promise<TablaDeTorneos> {
    const temporada = await this.prisma.temporadaTour.findUnique({
      where: { id: temporadaId },
      select: { id: true, nombre: true, fechaInicio: true, fechaFin: true },
    });

    if (!temporada) {
      throw new NotFoundException('No hay una temporada con ese número.');
    }

    // **Todas las categorías de una vez**, en una sola consulta: para saber cuáles
    // tienen filas hay que calcularlas, y son un puñado de cuadros por temporada.
    const cuadros = await this.prisma.torneoCategoria.findMany({
      // **Solo los de torneos `FINALIZADO`.** Un torneo a medias no reparte puntos de
      // campeón, y uno cancelado no se jugó.
      where: {
        torneo: {
          estado: EstadoTorneo.FINALIZADO,
          tours: { some: { nivel: { temporadaId } } },
        },
      },
      orderBy: [
        { torneo: { fechaFin: 'desc' } },
        { torneo: { id: 'desc' } },
        { id: 'desc' },
      ],
      select: {
        id: true,
        torneoId: true,
        categoriaJuegoId: true,
        categoriaJuego: { select: { nombre: true, orden: true } },
        torneo: {
          select: {
            nombre: true,
            fechaFin: true,
            // **Una sola asociación por temporada**: la temporada es de un tour, y un
            // torneo suma una vez por tour (`torneo_tour` único en torneo y tour).
            tours: {
              where: { nivel: { temporadaId } },
              select: {
                nivel: { select: { nombre: true, ...COLUMNAS_DE_LA_TABLA } },
              },
            },
          },
        },
        // Todos los partidos del cuadro: el motor necesita el cuadro entero para saber
        // cuántas rondas tuvo y quién ganó la final.
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

    const nombres = await this.nombresDe(cuadros);

    // Una tabla por categoría de juego (D4): el campeón de 4ª y el de Honor del mismo
    // torneo no se comparan.
    const grupos = new Map<number, typeof cuadros>();
    for (const cuadro of cuadros) {
      const suyos = grupos.get(cuadro.categoriaJuegoId) ?? [];
      grupos.set(cuadro.categoriaJuegoId, [...suyos, cuadro]);
    }

    const tablas = [...grupos].map(([id, suyos]) => ({
      id,
      ...suyos[0].categoriaJuego,
      cuadros: suyos,
      posiciones: tablaDeRanking(suyos.map(aTerminado), nombres),
    }));
    const conFilas = tablas
      .filter((una) => una.posiciones.length > 0)
      .sort((una, otra) => otra.orden - una.orden);
    const elegida = categoriaId ?? conFilas[0]?.id ?? null;
    const suya = tablas.find((una) => una.id === elegida);

    return {
      temporada: {
        ...temporada,
        fechaInicio: comoFechaCivil(temporada.fechaInicio),
        fechaFin: comoFechaCivil(temporada.fechaFin),
      },
      categorias: conFilas.map(({ id, nombre }) => ({ id, nombre })),
      categoriaId: elegida,
      torneos: (suya?.cuadros ?? []).map((cuadro) => ({
        id: cuadro.id,
        torneoId: cuadro.torneoId,
        nombre: cuadro.torneo.nombre,
        categoria: cuadro.categoriaJuego.nombre,
        nivel: cuadro.torneo.tours[0].nivel.nombre,
        fechaFin: comoFechaCivil(cuadro.torneo.fechaFin),
      })),
      posiciones: suya?.posiciones ?? [],
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

/** Lo que el motor necesita de un cuadro: sus partidos y la tabla de su nivel. */
function aTerminado(cuadro: {
  torneo: {
    tours: {
      nivel: Parameters<typeof deColumnas>[0];
    }[];
  };
  partidos: CuadroTerminado['partidos'];
}): CuadroTerminado {
  return {
    tabla: deColumnas(cuadro.torneo.tours[0].nivel),
    partidos: cuadro.partidos,
  };
}
