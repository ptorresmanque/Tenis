import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { CambioDeJugador, JugadorNuevo } from './torneos.dto';

/** Lo que se lee de un jugador para mostrarlo. */
const FICHA = {
  id: true,
  nombre: true,
  apellido: true,
  telefono: true,
  socioId: true,
  activo: true,
  socio: { select: { numeroSocio: true } },
} as const;

/** Cómo se publica un jugador. */
export interface JugadorPublicado {
  id: number;
  nombre: string;
  apellido: string;
  telefono: string | null;
  socioId: number | null;
  numeroSocio: string | null;
  activo: boolean;
}

/**
 * El número de socio sale plano y no anidado bajo `socio`.
 *
 * La pantalla lo muestra al lado del nombre en todas las listas de jugadores; dejarlo
 * anidado obliga a cada una a saber cómo está guardada la relación.
 */
function comoFicha(fila: {
  id: number;
  nombre: string;
  apellido: string;
  telefono: string | null;
  socioId: number | null;
  activo: boolean;
  socio: { numeroSocio: string } | null;
}): JugadorPublicado {
  return {
    id: fila.id,
    nombre: fila.nombre,
    apellido: fila.apellido,
    telefono: fila.telefono,
    socioId: fila.socioId,
    numeroSocio: fila.socio?.numeroSocio ?? null,
    activo: fila.activo,
  };
}

/**
 * Quiénes juegan torneos.
 *
 * **El jugador no es el socio.** Vuelve el año siguiente, acumula puntos y aparece en
 * una tabla que ordena personas; sin ficha estable, el ranking suma "J. Pérez" y "Juan
 * Pérez" por separado y la tabla queda mal a la vista de todos. Por eso el socio tiene
 * un jugador que se **reutiliza**, y el de afuera queda disponible para el torneo
 * siguiente.
 */
@Injectable()
export class Jugadores {
  constructor(private readonly prisma: PrismaService) {}

  async listar(soloActivos = false): Promise<JugadorPublicado[]> {
    const jugadores = await this.prisma.jugador.findMany({
      where: soloActivos ? { activo: true } : {},
      orderBy: [{ activo: 'desc' }, { apellido: 'asc' }, { nombre: 'asc' }],
      select: FICHA,
    });

    return jugadores.map(comoFicha);
  }

  /**
   * El jugador de un socio, creándolo la primera vez.
   *
   * **Idempotente a propósito**: es la operación que usa la inscripción a un torneo, y
   * el mismo socio se inscribe en varios. Si creara uno por torneo, el ranking sumaría
   * los puntos de la misma persona en filas distintas, que es exactamente lo que este
   * modelo existe para evitar.
   */
  async deSocio(socioId: number): Promise<JugadorPublicado> {
    const existente = await this.prisma.jugador.findUnique({
      where: { socioId },
      select: FICHA,
    });

    if (existente) return comoFicha(existente);

    const socio = await this.prisma.socio.findUnique({
      where: { id: socioId },
      select: {
        usuario: { select: { nombre: true, apellido: true, telefono: true } },
      },
    });

    if (!socio) throw new NotFoundException('No hay un socio con ese número.');

    // El nombre se **copia** y no se lee de la ficha cada vez: el jugador tiene que
    // poder seguir existiendo —con sus puntos y sus partidos— aunque la ficha se dé de
    // baja y `socioId` quede en nulo.
    return comoFicha(
      await this.prisma.jugador.create({
        data: {
          socioId,
          nombre: socio.usuario.nombre,
          apellido: socio.usuario.apellido,
          telefono: socio.usuario.telefono,
        },
        select: FICHA,
      }),
    );
  }

  async crear(datos: JugadorNuevo): Promise<JugadorPublicado> {
    return comoFicha(
      await this.prisma.jugador.create({
        data: {
          socioId: null,
          nombre: datos.nombre,
          apellido: datos.apellido,
          telefono: datos.telefono,
        },
        select: FICHA,
      }),
    );
  }

  /**
   * Edita al jugador, incluido enlazarlo a una ficha de socio.
   *
   * **Enlazar es escribir un campo, no crear una fila.** El externo que se hace socio
   * conserva su jugador y con él sus puntos y sus partidos: cuelgan del jugador y no
   * del socio, así que hacerse socio no puede significar empezar de cero.
   */
  async editar(id: number, cambio: CambioDeJugador): Promise<JugadorPublicado> {
    if (cambio.socioId !== undefined) {
      await this.exigirSocioLibre(id, cambio.socioId);
    }

    const { count } = await this.prisma.jugador.updateMany({
      where: { id },
      data: cambio,
    });

    if (count === 0) {
      throw new NotFoundException('No hay un jugador con ese número.');
    }

    return comoFicha(
      await this.prisma.jugador.findUniqueOrThrow({
        where: { id },
        select: FICHA,
      }),
    );
  }

  /**
   * Que ese socio no tenga ya otro jugador.
   *
   * Lo impide el único de la base, pero el error crudo de Prisma no dice cuál de los
   * dos jugadores es el que ya está enlazado, que es justo lo que el club necesita
   * saber para decidir con cuál se queda.
   */
  private async exigirSocioLibre(id: number, socioId: number): Promise<void> {
    const suyo = await this.prisma.jugador.findUnique({
      where: { socioId },
      select: { id: true, nombre: true, apellido: true },
    });

    if (suyo && suyo.id !== id) {
      throw new ConflictException(
        `Ese socio ya juega como ${suyo.nombre} ${suyo.apellido}. ` +
          'Si son la misma persona, edita ese jugador en vez de enlazar este.',
      );
    }
  }
}
