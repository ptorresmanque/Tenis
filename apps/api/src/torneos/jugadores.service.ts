import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarTelefono } from './telefono';
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
 * La llave del dedupe, tal como la lee la base.
 *
 * Las tres columnas juntas y no el teléfono solo: una familia comparte teléfono —el
 * padre inscribe a sus hijos con el suyo— y con el número de llave los tres quedaban
 * convertidos en una sola persona.
 */
function llaveDe(datos: {
  telefono: string;
  nombre: string;
  apellido: string;
}): { telefono: string; nombre: string; apellido: string } {
  return {
    telefono: datos.telefono,
    nombre: datos.nombre,
    apellido: datos.apellido,
  };
}

/** El choque del único, dicho con el nombre que lo produce. */
function yaEsSuya(nombre: string, apellido: string): ConflictException {
  return new ConflictException(
    `Ya hay un jugador que se llama ${nombre} ${apellido} con ese teléfono. ` +
      'Búscalo en la lista en vez de anotarlo otra vez; si es otra persona de la ' +
      'misma familia, revisa el nombre y los apellidos.',
  );
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
          // Normalizado, no como está en su ficha: desde T64 la columna es única y es
          // la llave con que se decide si dos inscripciones son la misma persona. Un
          // `+56 9 1111 2222` en crudo no chocaría con el `56911112222` de su propio
          // jugador externo, y esa persona quedaría partida en dos.
          telefono: normalizarTelefono(socio.usuario.telefono),
        },
        select: FICHA,
      }),
    );
  }

  /**
   * Anota a alguien de afuera.
   *
   * **Repetir la ficha entera no es un error del sistema, es un dato que el club ya
   * tiene**: el trío teléfono–nombre–apellidos es la llave con que se decide si dos
   * inscripciones son la misma persona. Un teléfono repetido con otro nombre sí entra,
   * porque una familia comparte teléfono.
   */
  async crear(datos: JugadorNuevo): Promise<JugadorPublicado> {
    const telefono = normalizarTelefono(datos.telefono);

    try {
      return comoFicha(
        await this.prisma.jugador.create({
          data: {
            socioId: null,
            nombre: datos.nombre,
            apellido: datos.apellido,
            telefono,
          },
          select: FICHA,
        }),
      );
    } catch (falla) {
      if (esViolacionDeUnicidad(falla) && telefono !== null) {
        throw yaEsSuya(datos.nombre, datos.apellido);
      }

      throw falla;
    }
  }

  /**
   * El jugador de quien se inscribe solo: **se reutiliza o se crea**.
   *
   * Es la defensa contra el problema que abre la inscripción pública. Quien escribe el
   * nombre es el propio jugador, distinto cada año y sin nadie que revise antes de
   * guardar; sin esta reutilización, el ranking suma los puntos de "J. Pérez" y "Juan
   * Pérez" por separado y la tabla queda mal a la vista del club.
   *
   * **La llave es el teléfono más el nombre y los apellidos, y ya no el teléfono
   * solo.** El club encontró el caso que rompía la versión anterior: el padre que
   * inscribe a sus hijos deja su propio número en las tres fichas, así que con el
   * teléfono de llave los tres menores eran una sola persona y el segundo hijo recibía
   * un "ya estás inscrito" que nadie sabía cómo interpretar. La collation de la base
   * hace el resto: "Juan Pérez" y "juan perez" siguen siendo uno.
   *
   * **Reutilizar es usarlo tal cual, no reescribirlo.** El spec pedía actualizar sus
   * datos de contacto, y era razonable cuando quien escribía era el admin: en un
   * formulario abierto es un vector de vandalismo. Los teléfonos chilenos son
   * enumerables, así que quien adivine uno podría reescribir la ficha de cualquier
   * jugador —incluida la de un socio— desde internet y sin cuenta, y ese nombre es el
   * que sale en el ranking y en la lista pública del cuadro.
   *
   * Lo único que se completa es lo que está **vacío**: rellenar un hueco no le quita
   * nada a nadie. Corregir un nombre es cosa del panel, que sí pide sesión.
   *
   * **Lo que garantiza el dedupe es el único de la base, no el `findUnique`.**
   * Comprobado por mutación: anulando la búsqueda previa los tests siguen pasando,
   * porque el `create` choca y el `catch` termina en el mismo lugar. La búsqueda es el
   * atajo del caso normal —quien vuelve el año siguiente—; la corrección la pone la
   * columna única.
   *
   * Recibe el cliente por parámetro para poder correr **dentro de la transacción** de
   * la inscripción: así no se escribe un jugador que después no se va a poder inscribir.
   */
  async porTelefono(
    db: PrismaService | Prisma.TransactionClient,
    datos: {
      nombre: string;
      apellido: string;
      telefono: string;
      procedencia: string;
    },
  ): Promise<JugadorPublicado> {
    const suyo = await db.jugador.findUnique({
      where: { telefono_nombre_apellido: llaveDe(datos) },
      select: { id: true, procedencia: true },
    });

    if (suyo) return this.completarHuecos(db, suyo, datos.procedencia);

    try {
      return comoFicha(
        await db.jugador.create({
          data: {
            socioId: null,
            nombre: datos.nombre,
            apellido: datos.apellido,
            telefono: datos.telefono,
            procedencia: datos.procedencia,
          },
          select: FICHA,
        }),
      );
    } catch (falla) {
      if (!esViolacionDeUnicidad(falla)) throw falla;

      // Se le adelantaron por milisegundos: dos envíos simultáneos de la misma
      // persona —lo que hace quien aprieta dos veces— pasan los dos por la búsqueda
      // sin encontrar nada y llegan los dos al `create`.
      const ganador = await db.jugador.findUniqueOrThrow({
        where: { telefono_nombre_apellido: llaveDe(datos) },
        select: { id: true, procedencia: true },
      });

      return this.completarHuecos(db, ganador, datos.procedencia);
    }
  }

  /** Rellena lo que está vacío y no toca nada más. Ver `porTelefono`. */
  private async completarHuecos(
    db: PrismaService | Prisma.TransactionClient,
    jugador: { id: number; procedencia: string | null },
    procedencia: string,
  ): Promise<JugadorPublicado> {
    if (jugador.procedencia) {
      return comoFicha(
        await db.jugador.findUniqueOrThrow({
          where: { id: jugador.id },
          select: FICHA,
        }),
      );
    }

    return comoFicha(
      await db.jugador.update({
        where: { id: jugador.id },
        data: { procedencia },
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

    const telefono =
      cambio.telefono === undefined
        ? undefined
        : normalizarTelefono(cambio.telefono);

    // **Cómo quedaría la ficha después del cambio.** La llave son las tres columnas
    // juntas, así que corregirle el nombre a un jugador puede chocar igual que
    // cambiarle el número: mirar solo el campo que viene en el cambio dejaría pasar la
    // mitad de los choques y saldrían como un 500 de Prisma.
    const actual = await this.prisma.jugador.findUnique({
      where: { id },
      select: { nombre: true, apellido: true, telefono: true },
    });

    if (!actual) {
      throw new NotFoundException('No hay un jugador con ese número.');
    }

    const quedaria = {
      telefono: telefono === undefined ? actual.telefono : telefono,
      nombre: cambio.nombre ?? actual.nombre,
      apellido: cambio.apellido ?? actual.apellido,
    };

    if (quedaria.telefono !== null) {
      const otro = await this.prisma.jugador.findUnique({
        where: {
          telefono_nombre_apellido: {
            ...quedaria,
            telefono: quedaria.telefono,
          },
        },
        select: { id: true },
      });

      if (otro && otro.id !== id) {
        throw yaEsSuya(quedaria.nombre, quedaria.apellido);
      }
    }

    await this.prisma.jugador.update({
      where: { id },
      data: telefono === undefined ? cambio : { ...cambio, telefono },
    });

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
