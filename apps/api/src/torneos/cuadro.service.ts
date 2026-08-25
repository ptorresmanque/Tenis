import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoInscripcionTorneo,
  EstadoTorneo,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { armarCuadro, nombreDeRonda } from './cuadro';

/** Un partido, como se dibuja en el cuadro. */
export interface PartidoPublicado {
  id: number;
  ronda: number;
  ronda_nombre: string;
  posicion: number;
  jugadorA: string | null;
  jugadorB: string | null;
  jugadorAId: number | null;
  jugadorBId: number | null;
  ganadorId: number | null;
  marcador: string | null;
  walkover: boolean;
}

export interface CuadroPublicado {
  torneoId: number;
  estado: EstadoTorneo;
  rondas: number;
  semillaSorteo: number | null;
  partidos: PartidoPublicado[];
}

/**
 * Armar y mostrar el cuadro.
 *
 * El cálculo vive en `cuadro.ts`, que es puro y se prueba solo. Acá está lo que toca
 * la base: leer quién está inscrito, guardar los partidos y cuidar que **rearmar no
 * borre historia**.
 */
@Injectable()
export class CuadroDelTorneo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Arma el cuadro y cierra la inscripción.
   *
   * La semilla se guarda: si alguien pregunta por qué le tocó ese cruce, el sorteo se
   * puede rehacer. Se genera acá y no la manda el cliente, para que el club no tenga
   * que inventar un número.
   */
  async armar(torneoId: number): Promise<CuadroPublicado> {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      select: { id: true, estado: true },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');

    if (torneo.estado !== EstadoTorneo.INSCRIPCION) {
      throw new ConflictException(
        'El cuadro de ese torneo ya está armado. Para rehacerlo, vuelve a inscripción.',
      );
    }

    const inscritos = await this.prisma.inscripcionTorneo.findMany({
      where: { torneoId, estado: EstadoInscripcionTorneo.INSCRITA },
      orderBy: { inscritaEn: 'asc' },
      select: { jugadorId: true, siembra: true },
    });

    if (inscritos.length < 2) {
      throw new ConflictException(
        'Hacen falta al menos dos jugadores inscritos para armar el cuadro.',
      );
    }

    const semilla = Math.floor(Math.random() * 2 ** 31);
    const partidos = armarCuadro(inscritos, semilla);

    await this.prisma.$transaction(async (tx) => {
      // Los partidos y el estado del torneo, o ninguna de las dos cosas: un torneo que
      // dice "cuadro armado" sin partidos es una pantalla en blanco donde la gente
      // busca su cruce.
      await tx.partido.createMany({
        data: partidos.map((partido) => ({ ...partido, torneoId })),
      });

      await tx.torneo.update({
        where: { id: torneoId },
        data: { estado: EstadoTorneo.CUADRO_ARMADO, semillaSorteo: semilla },
      });
    });

    return this.leer(torneoId);
  }

  /**
   * Deshace el cuadro y vuelve a inscripción.
   *
   * **Solo mientras no haya resultados cargados.** Rearmar un cuadro con partidos
   * jugados es rehacer la historia: alguien ganó de verdad y su partido desaparecería.
   * Si el admin se equivocó y todavía no cargó nada, puede volver.
   */
  async deshacer(torneoId: number): Promise<{ torneoId: number }> {
    const jugados = await this.prisma.partido.count({
      where: { torneoId, marcador: { not: null } },
    });

    if (jugados > 0) {
      throw new ConflictException(
        `Ese cuadro ya tiene ${jugados} ${jugados === 1 ? 'partido jugado' : 'partidos jugados'}: ` +
          'rehacerlo borraría resultados que ya pasaron.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.partido.deleteMany({ where: { torneoId } });
      await tx.torneo.update({
        where: { id: torneoId },
        data: { estado: EstadoTorneo.INSCRIPCION, semillaSorteo: null },
      });
    });

    return { torneoId };
  }

  /** El cuadro entero, para dibujarlo. */
  async leer(torneoId: number): Promise<CuadroPublicado> {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      select: { id: true, estado: true, semillaSorteo: true },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');

    const partidos = await this.prisma.partido.findMany({
      where: { torneoId },
      orderBy: [{ ronda: 'asc' }, { posicion: 'asc' }],
      select: {
        id: true,
        ronda: true,
        posicion: true,
        jugadorAId: true,
        jugadorBId: true,
        ganadorId: true,
        marcador: true,
        walkover: true,
        jugadorA: { select: { nombre: true, apellido: true } },
        jugadorB: { select: { nombre: true, apellido: true } },
      },
    });

    const rondas = partidos.reduce(
      (mayor, partido) => Math.max(mayor, partido.ronda),
      0,
    );

    return {
      torneoId: torneo.id,
      estado: torneo.estado,
      rondas,
      semillaSorteo: torneo.semillaSorteo,
      partidos: partidos.map((partido) => ({
        id: partido.id,
        ronda: partido.ronda,
        // El nombre se calcula al mostrar y no se guarda: "cuartos" depende del
        // tamaño del cuadro, y guardarlo obligaría a recalcularlo si el cuadro cambia.
        ronda_nombre: nombreDeRonda(partido.ronda, rondas),
        posicion: partido.posicion,
        jugadorA: nombre(partido.jugadorA),
        jugadorB: nombre(partido.jugadorB),
        jugadorAId: partido.jugadorAId,
        jugadorBId: partido.jugadorBId,
        ganadorId: partido.ganadorId,
        marcador: partido.marcador,
        walkover: partido.walkover,
      })),
    };
  }
}

function nombre(
  jugador: { nombre: string; apellido: string } | null,
): string | null {
  return jugador ? `${jugador.nombre} ${jugador.apellido}` : null;
}
