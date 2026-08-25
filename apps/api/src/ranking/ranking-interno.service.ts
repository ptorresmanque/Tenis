import { Injectable } from '@nestjs/common';

import { comoFechaCivil, hoyEnElClub } from '../comun/tiempo';
import { EstadoPartidoInterno } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FilaInterna, tablaInterna } from './elo';
import { NOMBRE_DEL_SOCIO, nombreDeSocio } from './nombres';

export interface TablaDelClub {
  /** Cuántos partidos confirmados está contando. */
  partidos: number;
  /** El más reciente de ellos. `null` si todavía no hay ninguno. */
  ultimoPartido: string | null;
  /** Quien no juega desde este día sale de la tabla principal. */
  inactivosDesde: string;
  posiciones: FilaInterna[];
}

/**
 * El ranking interno: el orden de juego entre socios.
 *
 * **Solo los partidos confirmados.** Un pendiente no puntúa, y ésa es la regla que hace
 * creíble la tabla: sin ella la escribe quien más se acuerda de cargar sus victorias.
 *
 * Como el de torneos, se calcula al consultar. Acá cuesta un poco más —Elo es secuencial
 * y hay que recorrer **todos** los partidos en orden, no sumar— y sigue siendo trivial a
 * escala de club. Compra lo mismo: corregir un partido de marzo deja la tabla correcta
 * sin que nadie recalcule nada.
 */
@Injectable()
export class RankingInterno {
  constructor(private readonly prisma: PrismaService) {}

  async tabla(hoy: Date = hoyEnElClub()): Promise<TablaDelClub> {
    // El orden se pide acá **y** se vuelve a fijar en el motor: la base lo devuelve
    // ordenado para no traerlo al revés, y el motor no depende de que lo esté.
    const partidos = await this.prisma.partidoInterno.findMany({
      where: { estado: EstadoPartidoInterno.CONFIRMADO },
      orderBy: [{ jugadoEn: 'asc' }, { cargadoEn: 'asc' }],
      select: {
        socioAId: true,
        socioBId: true,
        ganadorSocioId: true,
        jugadoEn: true,
        cargadoEn: true,
      },
    });

    const inactivosDesde = new Date(hoy);
    inactivosDesde.setUTCMonth(inactivosDesde.getUTCMonth() - 6);

    return {
      partidos: partidos.length,
      // El último es el último de la lista, que ya viene ordenada de más viejo a más
      // nuevo. La pantalla lo muestra: una tabla que no dice hasta cuándo cuenta no
      // se puede explicar cuando alguien pregunta por qué no está su partido.
      ultimoPartido:
        partidos.length > 0
          ? comoFechaCivil(partidos[partidos.length - 1].jugadoEn)
          : null,
      inactivosDesde: comoFechaCivil(inactivosDesde),
      posiciones: tablaInterna(
        partidos.map((partido) => ({
          ...partido,
          cargadoEn: partido.cargadoEn.getTime(),
        })),
        await this.nombresDe(partidos),
        hoy,
      ),
    };
  }

  /**
   * Cómo se llama cada socio que aparece en esos partidos.
   *
   * En una sola consulta y no una por socio. **Solo el nombre**: esta tabla la mira
   * gente del club, no hace falta que arrastre correos ni estados de cuenta.
   */
  private async nombresDe(
    partidos: { socioAId: number; socioBId: number }[],
  ): Promise<Map<number, string>> {
    const ids = new Set(
      partidos.flatMap((partido) => [partido.socioAId, partido.socioBId]),
    );

    const socios = await this.prisma.socio.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, ...NOMBRE_DEL_SOCIO },
    });

    return new Map(socios.map((socio) => [socio.id, nombreDeSocio(socio)]));
  }
}
