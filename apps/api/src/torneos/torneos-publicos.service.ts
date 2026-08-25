import { Injectable, NotFoundException } from '@nestjs/common';

import {
  EstadoInscripcionTorneo,
  EstadoTorneo,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nombreDeRonda } from './cuadro';

/** Un torneo del calendario, como lo ve quien todavía no es del club. */
export interface TorneoPublico {
  id: number;
  nombre: string;
  categoria: string;
  superficie: string | null;
  fechaInicio: string;
  fechaFin: string;
  cierreInscripcion: string;
  estado: EstadoTorneo;
  cupo: number;
  cuposLibres: number;
}

/** Un partido publicado. Nombres y marcador, nada más. */
export interface PartidoPublico {
  ronda: number;
  ronda_nombre: string;
  posicion: number;
  jugadorA: string | null;
  jugadorB: string | null;
  ganador: string | null;
  marcador: string | null;
  walkover: boolean;
}

export interface CuadroPublico {
  id: number;
  nombre: string;
  categoria: string;
  estado: EstadoTorneo;
  inscritos: string[];
  partidos: PartidoPublico[];
}

/**
 * Lo que se ve de los torneos sin cuenta.
 *
 * El perfil pide publicar el calendario, y es de las pocas cosas que un tercero mira
 * antes de asociarse: un club con torneos es un club con vida. El cuadro es lo otro
 * —está colgado en el mural y esta pantalla es el mismo mural, accesible desde el
 * teléfono de quien está en la cancha de al lado.
 *
 * **De las personas sale el nombre y nada más.** El teléfono de un jugador es dato
 * suyo: el club lo tiene para llamarlo, no para publicarlo. Por eso este servicio arma
 * sus propias formas en vez de reusar las del panel, donde el teléfono sí va.
 */
@Injectable()
export class TorneosPublicos {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El calendario del año.
   *
   * Sin los cancelados: un torneo que no se va a jugar no es calendario, es ruido en
   * la pantalla que alguien mira para decidir si se asocia.
   */
  async calendario(anio: number): Promise<TorneoPublico[]> {
    const torneos = await this.prisma.torneo.findMany({
      where: {
        estado: { not: EstadoTorneo.CANCELADO },
        fechaInicio: {
          gte: new Date(Date.UTC(anio, 0, 1)),
          lt: new Date(Date.UTC(anio + 1, 0, 1)),
        },
      },
      orderBy: [{ fechaInicio: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nombre: true,
        superficie: true,
        fechaInicio: true,
        fechaFin: true,
        cierreInscripcion: true,
        estado: true,
        cupo: true,
        categoria: { select: { nombre: true } },
        // Solo el número: cuántos lugares quedan, no quiénes están.
        _count: {
          select: {
            inscripciones: {
              where: { estado: EstadoInscripcionTorneo.INSCRITA },
            },
          },
        },
      },
    });

    return torneos.map((torneo) => ({
      id: torneo.id,
      nombre: torneo.nombre,
      categoria: torneo.categoria.nombre,
      superficie: torneo.superficie,
      // Fechas civiles y no instantes, por lo mismo que en el panel: un torneo empieza
      // un día, y mandarlas con hora invita a que la pantalla muestre el día anterior.
      fechaInicio: comoFechaCivil(torneo.fechaInicio),
      fechaFin: comoFechaCivil(torneo.fechaFin),
      cierreInscripcion: comoFechaCivil(torneo.cierreInscripcion),
      estado: torneo.estado,
      cupo: torneo.cupo,
      cuposLibres: Math.max(torneo.cupo - torneo._count.inscripciones, 0),
    }));
  }

  /**
   * El cuadro de un torneo, con los resultados que ya se cargaron.
   *
   * Se publica desde que está armado. Mientras la inscripción sigue abierta hay lista
   * de inscritos y todavía no hay cuadro, que es exactamente lo que la gente quiere
   * saber en ese momento: quiénes se anotaron.
   */
  async cuadro(id: number): Promise<CuadroPublico> {
    const torneo = await this.prisma.torneo.findFirst({
      where: { id, estado: { not: EstadoTorneo.CANCELADO } },
      select: {
        id: true,
        nombre: true,
        estado: true,
        categoria: { select: { nombre: true } },
        inscripciones: {
          where: { estado: EstadoInscripcionTorneo.INSCRITA },
          orderBy: [{ siembra: 'asc' }, { inscritaEn: 'asc' }],
          select: {
            jugador: { select: { nombre: true, apellido: true } },
          },
        },
        partidos: {
          orderBy: [{ ronda: 'asc' }, { posicion: 'asc' }],
          select: {
            ronda: true,
            posicion: true,
            marcador: true,
            walkover: true,
            jugadorA: { select: { nombre: true, apellido: true } },
            jugadorB: { select: { nombre: true, apellido: true } },
            ganador: { select: { nombre: true, apellido: true } },
          },
        },
      },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');

    const rondas = torneo.partidos.reduce(
      (mayor, partido) => Math.max(mayor, partido.ronda),
      0,
    );

    return {
      id: torneo.id,
      nombre: torneo.nombre,
      categoria: torneo.categoria.nombre,
      estado: torneo.estado,
      // Sin cast: un inscrito **siempre** tiene jugador —la relación es obligatoria—,
      // y el `as string[]` tapaba que se estaba usando el lector de los opcionales.
      inscritos: torneo.inscripciones.map(
        (fila) => `${fila.jugador.nombre} ${fila.jugador.apellido}`,
      ),
      partidos: torneo.partidos.map((partido) => ({
        ronda: partido.ronda,
        ronda_nombre: nombreDeRonda(partido.ronda, rondas),
        posicion: partido.posicion,
        jugadorA: nombre(partido.jugadorA),
        jugadorB: nombre(partido.jugadorB),
        ganador: nombre(partido.ganador),
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

/** Una columna `DATE` como la fecha civil que es. */
function comoFechaCivil(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
