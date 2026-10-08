import { Injectable } from '@nestjs/common';

import { fechaDelClub, hoyEnElClub, instanteEnElClub } from '../comun/tiempo';
import { EstadoClase, EstadoInscripcion } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Cuántos días de clases se anuncian de una vez. */
const DIAS_DE_LA_SEMANA = 7;

/**
 * Desde y hasta qué instante va la semana que arranca en esa fecha.
 *
 * **Los días se cuentan en el calendario, no sumando 24 horas.** El domingo en que
 * Chile adelanta la hora tiene 23, y con la aritmética de milisegundos la semana se
 * corre una hora: la clase del último día a las 21:00 se cae de la lista sin que nadie
 * entienda por qué. Es la misma regla que ya cuidan `calcularBloques` y la tira de días
 * de la disponibilidad.
 *
 * Exportada para poder probarla sola: el error solo se ve dos domingos al año, y un
 * test que dependa de qué día se corre no prueba nada el resto del tiempo.
 */
export function semanaDesde(fecha: string): { desde: Date; hasta: Date } {
  const ultimo = fechaDelClub(fecha);
  ultimo.setUTCDate(ultimo.getUTCDate() + DIAS_DE_LA_SEMANA);

  return {
    desde: instanteEnElClub(fecha, '00:00'),
    hasta: instanteEnElClub(ultimo.toISOString().slice(0, 10), '00:00'),
  };
}

/** Un profesor, como lo anuncia el club. */
export interface ProfesorPublico {
  nombreVisible: string;
  especialidad: string;
}

/** Una clase de la semana, como la ve quien todavía no es del club. */
/**
 * Una serie de clases, como la anuncia el club (T117): una tarjeta en vez de una por fecha.
 * Los días, el horario y hasta cuándo; el cupo es el más chico entre sus clases que vienen,
 * porque la inscripción es a la serie completa (T116).
 */
export interface SeriePublica {
  id: number;
  profesor: string;
  cancha: string;
  nivel: string;
  /** De 0 (domingo) a 6 (sábado). */
  diasSemana: number[];
  horaDesde: string;
  horaHasta: string;
  /** La fecha civil de su última clase programada: si se canceló desde un día, se acorta. */
  hasta: string;
  cuposLibres: number;
}

export interface ClasePublica {
  id: number;
  cancha: string;
  profesor: string;
  inicio: Date;
  fin: Date;
  nivel: string;
  cuposLibres: number;
}

/**
 * Lo que se ve de las clases sin cuenta.
 *
 * Hoy no hay dónde mandar al apoderado que busca clases para su hijo: es uno de los
 * cinco públicos del perfil y el único sin ninguna vía de contacto. Acá ve **quiénes
 * son los profesores** y **qué clases hay en la semana**, y pregunta por el formulario.
 *
 * **Nada de la lista de inscritos.** Quién va a clases es dato de las personas que van
 * y publicarlo no le sirve a nadie más. Por eso este servicio arma sus propias formas
 * en vez de reusar las del panel: un `select` compartido con el admin es un campo
 * nuevo del admin publicado sin que nadie lo decida.
 *
 * De los profesores tampoco sale la tarifa ni el teléfono: lo que el club le paga a
 * cada uno es interno, y para hablar con ellos está el formulario del club.
 */
@Injectable()
export class ClasesPublicas {
  constructor(private readonly prisma: PrismaService) {}

  /** Los profesores activos, ordenados como se leen. */
  profesores(): Promise<ProfesorPublico[]> {
    return this.prisma.profesor.findMany({
      where: { activo: true },
      orderBy: { nombreVisible: 'asc' },
      select: { nombreVisible: true, especialidad: true },
    });
  }

  /**
   * Las clases de una semana, desde la fecha que se pida.
   *
   * `desde` existe para el que planifica —"¿y la otra semana?"—, y sin él arranca hoy,
   * que es lo que busca quien llega al sitio.
   */
  async delaSemana(desde: string): Promise<ClasePublica[]> {
    const semana = semanaDesde(desde);

    const clases = await this.prisma.clase.findMany({
      where: {
        estado: EstadoClase.PROGRAMADA,
        inicio: { gte: semana.desde, lt: semana.hasta },
        // Las de una serie van en su tarjeta (T117): repetirlas acá sería decir lo mismo
        // una vez por fecha.
        serieId: null,
      },
      orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        inicio: true,
        fin: true,
        nivel: true,
        cupoMaximo: true,
        cancha: { select: { nombre: true } },
        profesor: { select: { nombreVisible: true } },
        // Solo el número: es el cupo que queda, no quiénes son.
        _count: {
          select: {
            inscripciones: {
              where: {
                estado: {
                  in: [
                    EstadoInscripcion.INSCRITA,
                    EstadoInscripcion.ASISTIO,
                    EstadoInscripcion.FALTO,
                  ],
                },
              },
            },
          },
        },
      },
    });

    return clases.map((clase) => ({
      id: clase.id,
      cancha: clase.cancha.nombre,
      profesor: clase.profesor.nombreVisible,
      inicio: clase.inicio,
      fin: clase.fin,
      nivel: clase.nivel,
      // Nunca negativo: si el club subió a alguien por encima del cupo, "quedan -1"
      // no es una respuesta que nadie pueda usar.
      cuposLibres: Math.max(clase.cupoMaximo - clase._count.inscripciones, 0),
    }));
  }

  /**
   * Las series con clases por delante desde ese día (T117), una por tarjeta.
   *
   * ponytail: trae las clases que vienen de cada serie para el cupo y la última fecha; con el
   * tope de 6 meses son a lo más unas 50 por serie. Si el club llega a tener muchas series,
   * calcularlo con un `groupBy`.
   */
  async series(desde: string): Promise<SeriePublica[]> {
    const inicio = instanteEnElClub(desde, '00:00');
    const queVienen = {
      estado: EstadoClase.PROGRAMADA,
      inicio: { gte: inicio },
    };

    const series = await this.prisma.serieDeClases.findMany({
      where: { clases: { some: queVienen } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        diasSemana: true,
        horaDesde: true,
        horaHasta: true,
        nivel: true,
        cancha: { select: { nombre: true } },
        profesor: { select: { nombreVisible: true } },
        clases: {
          where: queVienen,
          orderBy: { inicio: 'asc' },
          select: {
            inicio: true,
            cupoMaximo: true,
            _count: {
              select: {
                inscripciones: {
                  where: {
                    estado: {
                      in: [
                        EstadoInscripcion.INSCRITA,
                        EstadoInscripcion.ASISTIO,
                        EstadoInscripcion.FALTO,
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return series.map((serie) => ({
      id: serie.id,
      profesor: serie.profesor.nombreVisible,
      cancha: serie.cancha.nombre,
      nivel: serie.nivel,
      diasSemana: serie.diasSemana.split(',').map(Number),
      horaDesde: serie.horaDesde,
      horaHasta: serie.horaHasta,
      hasta: hoyEnElClub(serie.clases[serie.clases.length - 1].inicio)
        .toISOString()
        .slice(0, 10),
      cuposLibres: Math.max(
        Math.min(
          ...serie.clases.map(
            (clase) => clase.cupoMaximo - clase._count.inscripciones,
          ),
        ),
        0,
      ),
    }));
  }
}
