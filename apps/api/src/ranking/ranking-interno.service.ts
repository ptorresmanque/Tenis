import { Injectable } from '@nestjs/common';

import { comoFechaCivil, hoyEnElClub } from '../comun/tiempo';
import { EstadoPartidoInterno } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { corteDeInactividad, FilaInterna, tablaInterna } from './elo';
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

    // El corte sale del motor y no se recalcula acá: es el número que la pantalla
    // anuncia, y anunciarlo desde otro lado es prometer un corte que puede no ser el
    // que se aplica.
    const ultimo = partidos.reduce<Date | null>(
      (mayor, partido) =>
        mayor === null || partido.jugadoEn > mayor ? partido.jugadoEn : mayor,
      null,
    );

    return {
      partidos: partidos.length,
      // El máximo y no el último de la lista: viene ordenada, pero depender de eso
      // hace que un `orderBy` cambiado de lugar mienta en silencio. El motor ya se
      // defiende reordenando por su cuenta; esta línea también.
      ultimoPartido: ultimo === null ? null : comoFechaCivil(ultimo),
      inactivosDesde: comoFechaCivil(corteDeInactividad(hoy)),
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
