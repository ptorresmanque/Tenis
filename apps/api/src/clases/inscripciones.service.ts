import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ZONA_DEL_CLUB } from '../comun/tiempo';
import {
  EstadoClase,
  EstadoInscripcion,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { InscripcionNueva } from './clases.dto';

/**
 * Los estados en que una inscripción ocupa un lugar en la clase.
 *
 * Tipado como la lista completa de estados a propósito: sin eso, `includes` obliga a
 * un cast que también silenciaría un estado nuevo del enum que nadie decidió de qué
 * lado cae. Con el tipo ancho, el compilador deja preguntar y la respuesta se lee acá.
 */
const OCUPAN: EstadoInscripcion[] = [
  EstadoInscripcion.INSCRITA,
  EstadoInscripcion.ASISTIO,
  EstadoInscripcion.FALTO,
];

/** "jueves 22 de octubre", en la hora del club: para decir qué clase de la serie está llena. */
const DIA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Quién viene a la clase, como se lee en la ficha. */
export interface Inscrito {
  id: number;
  /** El socio, para inscribirlo o sacarlo de la serie (T116); nulo si es alumno de afuera. */
  socioId: number | null;
  nombre: string;
  telefono: string;
  esSocio: boolean;
  numeroSocio: string | null;
  estado: EstadoInscripcion;
  inscritaEn: Date;
}

export interface FichaDeClase {
  id: number;
  cancha: string;
  profesor: string;
  inicio: Date;
  fin: Date;
  nivel: string;
  estado: EstadoClase;
  cupoMaximo: number;
  cupoTomado: number;
  notas: string | null;
  /** La serie que la agendó (T113), o nulo si es una clase suelta. */
  serieId: number | null;
  inscritos: Inscrito[];
}

/**
 * Quién viene a cada clase.
 *
 * **El cupo lo decide el servidor y no la pantalla.** La pantalla anticipa —muestra
 * cuántos lugares quedan— pero dos personas apretando el último a la vez es el caso
 * normal en un club chico donde el mesón y el teléfono inscriben al mismo tiempo. Sin
 * un cerrojo, las dos cuentan los mismos inscritos, las dos ven un lugar libre y las
 * dos entran; el profesor se entera con un alumno de más en la cancha.
 *
 * **La inscripción no mira si el socio está al día.** Es deliberado: el club cobra las
 * clases en paquetes en el mesón —ver `SPEC-clases.md` § Lo que falta para cobrar— y
 * quien paga su paquete puede tener la cuota atrasada. Rechazarlo acá sería inventar
 * una regla que el club no pidió, y hacerla aparecer en la lista del profesor.
 */
@Injectable()
export class Inscripciones {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inscribe a un socio o a un alumno de afuera.
   *
   * El cupo se comprueba **después** de tomar la fila de la clase como cerrojo, y esa
   * es toda la operación: la cuenta que decide y la fila que se escribe pasan a estar
   * dentro de la misma transacción, y la segunda petición espera a que la primera
   * termine para hacer su cuenta.
   */
  async inscribir(
    claseId: number,
    quien: InscripcionNueva,
  ): Promise<{ id: number }> {
    if (quien.socioId !== null) await this.exigirSocio(quien.socioId);

    return this.prisma.$transaction(async (tx) => {
      const clase = await this.tomarLaClase(tx, claseId);

      const tomados = await tx.inscripcionClase.count({
        where: { claseId, estado: { in: OCUPAN } },
      });

      if (tomados >= clase.cupoMaximo) {
        throw new ConflictException(
          `Esa clase ya tiene su cupo completo (${clase.cupoMaximo}).`,
        );
      }

      // El único de la base atrapa al socio repetido; acá se traduce a un mensaje que
      // se entiende, en vez del error crudo de Prisma.
      if (
        quien.socioId !== null &&
        (await this.yaEsta(tx, claseId, quien.socioId))
      ) {
        throw new ConflictException(
          'Ese socio ya está inscrito en esta clase.',
        );
      }

      const inscripcion = await tx.inscripcionClase.create({
        data: {
          claseId,
          socioId: quien.socioId,
          nombre: quien.nombre,
          telefono: quien.telefono,
        },
        select: { id: true },
      });

      return { id: inscripcion.id };
    });
  }

  /**
   * Inscribe en la serie completa (T116, decisión 8): una inscripción en cada clase que
   * viene, **en una transacción**. Si alguna está llena no se inscribe en ninguna, y el
   * rechazo dice cuáles: media serie es un alumno que no sabe a qué clases va.
   *
   * Las clases donde ya estaba —inscrito antes en una suelta— se saltan, sin duplicarlo.
   * Toma las filas de las clases como cerrojo, como `inscribir`, y **en orden de id**: dos
   * inscripciones a la misma serie las toman en el mismo orden y no se cruzan.
   */
  async inscribirEnLaSerie(
    serieId: number,
    quien: InscripcionNueva,
    ahora = new Date(),
  ): Promise<{ inscritas: number; yaEstaba: number }> {
    if (quien.socioId !== null) await this.exigirSocio(quien.socioId);

    const clases = await this.lasQueVienen(serieId, ahora);
    if (clases.length === 0) {
      throw new ConflictException('La serie ya no tiene clases por delante.');
    }

    return this.prisma.$transaction(async (tx) => {
      const ids = clases.map((clase) => clase.id).sort((a, b) => a - b);
      await tx.$queryRaw`SELECT id FROM clase WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;

      const nuevas: number[] = [];
      const llenas: Date[] = [];
      let yaEstaba = 0;

      for (const clase of clases) {
        if (await this.estaInscrito(tx, clase.id, quien)) {
          yaEstaba++;
          continue;
        }

        const tomados = await tx.inscripcionClase.count({
          where: { claseId: clase.id, estado: { in: OCUPAN } },
        });

        if (tomados >= clase.cupoMaximo) llenas.push(clase.inicio);
        else nuevas.push(clase.id);
      }

      if (llenas.length > 0) {
        throw new ConflictException(
          `No hay cupo ${llenas.length === 1 ? 'en la clase del' : 'en las clases del'} ` +
            `${llenas.map((inicio) => DIA.format(inicio).replace(',', '')).join(', ')}: ` +
            'no se inscribió en ninguna clase de la serie.',
        );
      }

      await tx.inscripcionClase.createMany({
        data: nuevas.map((claseId) => ({
          claseId,
          socioId: quien.socioId,
          nombre: quien.nombre,
          telefono: quien.telefono,
        })),
      });

      return { inscritas: nuevas.length, yaEstaba };
    });
  }

  /**
   * Saca a alguien de la serie (A10): cancela sus inscripciones en las clases que vienen.
   * Las anteriores quedan como estaban, con su asistencia: lo que pasó no se reescribe.
   */
  async salirDeLaSerie(
    serieId: number,
    quien: InscripcionNueva,
    ahora = new Date(),
  ): Promise<{ canceladas: number }> {
    await this.laSerie(serieId);

    const { count } = await this.prisma.inscripcionClase.updateMany({
      where: {
        ...this.quienEs(quien),
        estado: EstadoInscripcion.INSCRITA,
        clase: { serieId, inicio: { gt: ahora } },
      },
      data: { estado: EstadoInscripcion.CANCELADA },
    });

    return { canceladas: count };
  }

  /**
   * Saca a alguien de la clase.
   *
   * No borra la fila: queda `CANCELADA` en la lista. Quién se bajó de una clase y
   * cuándo es justo lo que el club quiere ver cuando decide si esa clase sigue.
   */
  async cancelar(claseId: number, id: number): Promise<{ id: number }> {
    const { count } = await this.prisma.inscripcionClase.updateMany({
      where: { id, claseId, estado: EstadoInscripcion.INSCRITA },
      data: { estado: EstadoInscripcion.CANCELADA },
    });

    if (count === 0) {
      throw new NotFoundException(
        'No hay una inscripción viva con ese número en esta clase.',
      );
    }

    return { id };
  }

  /**
   * Cierra la clase, con o sin lista.
   *
   * **Una clase se puede marcar realizada sin pasar lista.** La asistencia es un dato
   * que el club lleva si quiere —para que el profesor cobre por alumnos que vinieron,
   * si ese es el trato, y para saber a quién le está guardando un cupo que no usa—,
   * no un trámite que bloquea cerrar la clase.
   *
   * **No genera sanción.** La sanción por no usar una hora es una regla de `reservas`
   * sobre canchas que quedaron vacías; una clase se da igual con cinco que con seis.
   *
   * @param asistieron Ids de las inscripciones que vinieron. `null` = no se pasó
   * lista y nadie cambia de estado. Lista vacía = no vino nadie.
   */
  async realizar(
    claseId: number,
    asistieron: number[] | null,
  ): Promise<{ id: number }> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.clase.updateMany({
        where: { id: claseId, estado: EstadoClase.PROGRAMADA },
        data: { estado: EstadoClase.REALIZADA },
      });

      if (count === 0) {
        const existe = await tx.clase.count({ where: { id: claseId } });

        if (existe === 0) {
          throw new NotFoundException('No hay una clase con ese número.');
        }

        throw new ConflictException('Esa clase ya no está programada.');
      }

      if (asistieron === null) return { id: claseId };

      // `claseId` en los dos `where`, y no solo el id de la inscripción: una lista
      // con el id de otra clase marcaría presente a alguien que nunca estuvo acá.
      await tx.inscripcionClase.updateMany({
        where: {
          claseId,
          id: { in: asistieron },
          estado: EstadoInscripcion.INSCRITA,
        },
        data: { estado: EstadoInscripcion.ASISTIO },
      });

      // Los que quedan inscritos son los que no vinieron. Al que se bajó no se le
      // pasa lista: su fila ya dice lo que pasó con él.
      await tx.inscripcionClase.updateMany({
        where: { claseId, estado: EstadoInscripcion.INSCRITA },
        data: { estado: EstadoInscripcion.FALTO },
      });

      return { id: claseId };
    });
  }

  /** La ficha de la clase con su lista, que es lo que el profesor lleva a la cancha. */
  async ficha(id: number): Promise<FichaDeClase> {
    const clase = await this.prisma.clase.findUnique({
      where: { id },
      select: {
        id: true,
        inicio: true,
        fin: true,
        nivel: true,
        estado: true,
        cupoMaximo: true,
        notas: true,
        serieId: true,
        cancha: { select: { nombre: true } },
        profesor: { select: { nombreVisible: true } },
        inscripciones: {
          orderBy: { inscritaEn: 'asc' },
          select: {
            id: true,
            socioId: true,
            nombre: true,
            telefono: true,
            estado: true,
            inscritaEn: true,
            socio: {
              select: {
                numeroSocio: true,
                usuario: {
                  select: { nombre: true, apellido: true, telefono: true },
                },
              },
            },
          },
        },
      },
    });

    if (!clase) throw new NotFoundException('No hay una clase con ese número.');

    const inscritos = clase.inscripciones.map((fila) => ({
      id: fila.id,
      socioId: fila.socioId,
      // Del socio se leen de su ficha y no se copian: si cambia su teléfono, la lista
      // que el club usa para llamarlo queda al día sola.
      nombre: fila.socio
        ? `${fila.socio.usuario.nombre} ${fila.socio.usuario.apellido}`
        : (fila.nombre ?? 'Sin nombre'),
      telefono: fila.socio
        ? (fila.socio.usuario.telefono ?? '')
        : (fila.telefono ?? ''),
      esSocio: fila.socio !== null,
      numeroSocio: fila.socio?.numeroSocio ?? null,
      estado: fila.estado,
      inscritaEn: fila.inscritaEn,
    }));

    return {
      id: clase.id,
      cancha: clase.cancha.nombre,
      profesor: clase.profesor.nombreVisible,
      inicio: clase.inicio,
      fin: clase.fin,
      nivel: clase.nivel,
      estado: clase.estado,
      cupoMaximo: clase.cupoMaximo,
      cupoTomado: inscritos.filter((quien) => OCUPAN.includes(quien.estado))
        .length,
      notas: clase.notas,
      serieId: clase.serieId,
      inscritos,
    };
  }

  /**
   * Toma la fila de la clase como cerrojo y devuelve su cupo.
   *
   * `FOR UPDATE` sobre **la clase** y no sobre sus inscripciones: la fila existe
   * siempre y se toma por clave primaria, así que dos inscripciones a la misma clase
   * se ponen en fila y las de clases distintas no se cruzan. Bloquear las
   * inscripciones daría gap locks sobre una clase vacía, que es la receta de deadlock
   * que ya documentó `ReservasService.bloquearAlSocio`.
   *
   * Va por SQL crudo porque Prisma no expone `FOR UPDATE`; el id viaja parametrizado.
   */
  private async tomarLaClase(
    tx: Prisma.TransactionClient,
    claseId: number,
  ): Promise<{ cupoMaximo: number }> {
    await tx.$queryRaw`SELECT id FROM clase WHERE id = ${claseId} FOR UPDATE`;

    const clase = await tx.clase.findUnique({
      where: { id: claseId },
      select: { cupoMaximo: true, estado: true },
    });

    if (!clase) throw new NotFoundException('No hay una clase con ese número.');

    if (clase.estado !== EstadoClase.PROGRAMADA) {
      throw new ConflictException(
        'Esa clase ya no está programada: no se puede inscribir a nadie.',
      );
    }

    return { cupoMaximo: clase.cupoMaximo };
  }

  private async yaEsta(
    tx: Prisma.TransactionClient,
    claseId: number,
    socioId: number,
  ): Promise<boolean> {
    const cuantas = await tx.inscripcionClase.count({
      where: { claseId, socioId, estado: { in: OCUPAN } },
    });

    return cuantas > 0;
  }

  /** Las clases de la serie que todavía se van a dar: programadas y por delante. */
  private async lasQueVienen(serieId: number, ahora: Date) {
    await this.laSerie(serieId);

    return this.prisma.clase.findMany({
      where: { serieId, estado: EstadoClase.PROGRAMADA, inicio: { gt: ahora } },
      orderBy: { inicio: 'asc' },
      select: { id: true, inicio: true, cupoMaximo: true },
    });
  }

  private async laSerie(serieId: number): Promise<void> {
    const serie = await this.prisma.serieDeClases.findUnique({
      where: { id: serieId },
      select: { id: true },
    });

    if (!serie) throw new NotFoundException('No hay una serie con ese número.');
  }

  /**
   * Cómo se reconoce a la persona en una inscripción: el socio por su ficha, el alumno de
   * afuera por su nombre y su teléfono, que es lo único que el club sabe de él.
   */
  private quienEs(quien: InscripcionNueva): Prisma.InscripcionClaseWhereInput {
    return quien.socioId !== null
      ? { socioId: quien.socioId }
      : { socioId: null, nombre: quien.nombre, telefono: quien.telefono };
  }

  private async estaInscrito(
    tx: Prisma.TransactionClient,
    claseId: number,
    quien: InscripcionNueva,
  ): Promise<boolean> {
    const cuantas = await tx.inscripcionClase.count({
      where: { ...this.quienEs(quien), claseId, estado: { in: OCUPAN } },
    });

    return cuantas > 0;
  }

  private async exigirSocio(socioId: number): Promise<void> {
    const socio = await this.prisma.socio.findUnique({
      where: { id: socioId },
      select: { id: true },
    });

    if (!socio) throw new NotFoundException('No hay un socio con ese número.');
  }
}
