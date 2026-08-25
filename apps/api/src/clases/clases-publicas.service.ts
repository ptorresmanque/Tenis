import { Injectable } from '@nestjs/common';

import { instanteEnElClub } from '../comun/tiempo';
import { EstadoClase, EstadoInscripcion } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Cuántos días de clases se anuncian de una vez. */
const DIAS_DE_LA_SEMANA = 7;

/** Un profesor, como lo anuncia el club. */
export interface ProfesorPublico {
  nombreVisible: string;
  especialidad: string;
}

/** Una clase de la semana, como la ve quien todavía no es del club. */
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
    const clases = await this.prisma.clase.findMany({
      where: {
        estado: EstadoClase.PROGRAMADA,
        inicio: {
          gte: instanteEnElClub(desde, '00:00'),
          lt: new Date(
            instanteEnElClub(desde, '00:00').getTime() +
              DIAS_DE_LA_SEMANA * 24 * 60 * 60 * 1000,
          ),
        },
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
}
