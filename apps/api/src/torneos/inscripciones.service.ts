import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { hoyEnElClub } from '../comun/tiempo';
import {
  EstadoInscripcionTorneo,
  EstadoTorneo,
  type Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Jugadores } from './jugadores.service';

/** Una inscripción, como se lee en la lista del torneo. */
export interface InscripcionPublicada {
  id: number;
  jugadorId: number;
  jugador: string;
  numeroSocio: string | null;
  siembra: number | null;
  estado: EstadoInscripcionTorneo;
  inscritaEn: Date;
}

export interface ListaDelTorneo {
  torneoId: number;
  cupo: number;
  estado: EstadoTorneo;
  inscritos: InscripcionPublicada[];
  enEspera: InscripcionPublicada[];
  retirados: InscripcionPublicada[];
}

/**
 * Quién juega cada torneo.
 *
 * **Pasado el cupo se entra en lista de espera, no se rechaza.** Rechazar obligaría al
 * club a llevar la lista en un papel, que es de donde venimos. Y **promover es manual**:
 * el club llama por teléfono antes de meter a alguien en un cuadro que ya anunció.
 *
 * **El socio moroso puede inscribirse.** Es deliberado y va en contra del instinto: la
 * regla de morosidad que existe hoy es sobre reservar canchas, y extenderla a los
 * torneos es una decisión de club que nadie tomó. Si el club la quiere, es una
 * comprobación en este archivo.
 */
@Injectable()
export class InscripcionesATorneo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jugadores: Jugadores,
  ) {}

  /**
   * Inscribe a un jugador, o al socio por su ficha.
   *
   * El cupo se cuenta **después** de tomar la fila del torneo como cerrojo: sin él,
   * dos inscripciones simultáneas al último lugar cuentan las dos lo mismo, las dos
   * ven sitio y el cuadro se arma con un jugador de más.
   */
  async inscribir(
    torneoId: number,
    quien: { jugadorId?: number; socioId?: number },
  ): Promise<{ id: number; estado: EstadoInscripcionTorneo }> {
    const jugadorId =
      quien.jugadorId ??
      (await this.jugadores.deSocio(quien.socioId as number)).id;

    return this.prisma.$transaction(async (tx) => {
      const torneo = await this.tomarElTorneo(tx, torneoId);

      if (await this.yaEsta(tx, torneoId, jugadorId)) {
        throw new ConflictException(
          'Ese jugador ya está inscrito en el torneo.',
        );
      }

      const [tomados, esperando] = await Promise.all([
        tx.inscripcionTorneo.count({
          where: { torneoId, estado: EstadoInscripcionTorneo.INSCRITA },
        }),
        tx.inscripcionTorneo.count({
          where: { torneoId, estado: EstadoInscripcionTorneo.LISTA_ESPERA },
        }),
      ]);

      return tx.inscripcionTorneo.create({
        data: {
          torneoId,
          jugadorId,
          // **Con gente esperando, el que llega va al final de la fila aunque haya
          // lugar.** Un lugar que se libera es de quien lleva dos semanas esperando,
          // no del que se inscribió después; si no, la lista de espera deja de ser
          // una fila y el club queda explicándole a alguien por qué lo pasaron.
          estado:
            tomados < torneo.cupo && esperando === 0
              ? EstadoInscripcionTorneo.INSCRITA
              : EstadoInscripcionTorneo.LISTA_ESPERA,
        },
        select: { id: true, estado: true },
      });
    });
  }

  /**
   * Baja a alguien del torneo.
   *
   * **El primero de la lista de espera no entra solo.** Es la decisión de
   * `SPEC-torneos.md`: el club llama antes de meter a alguien en un cuadro, porque
   * quien quedó fuera hace dos semanas ya hizo otros planes.
   */
  async retirar(torneoId: number, id: number): Promise<{ id: number }> {
    const { count } = await this.prisma.inscripcionTorneo.updateMany({
      where: {
        id,
        torneoId,
        estado: { not: EstadoInscripcionTorneo.RETIRADA },
      },
      data: { estado: EstadoInscripcionTorneo.RETIRADA, siembra: null },
    });

    if (count === 0) {
      throw new NotFoundException(
        'No hay una inscripción viva con ese número en este torneo.',
      );
    }

    return { id };
  }

  /** Mete en el cuadro al que estaba esperando, si quedó lugar. */
  async promover(torneoId: number, id: number): Promise<{ id: number }> {
    return this.prisma.$transaction(async (tx) => {
      const torneo = await this.tomarElTorneo(tx, torneoId, false);

      const tomados = await tx.inscripcionTorneo.count({
        where: { torneoId, estado: EstadoInscripcionTorneo.INSCRITA },
      });

      if (tomados >= torneo.cupo) {
        throw new ConflictException(
          `El cuadro ya tiene sus ${torneo.cupo} jugadores. Retira a alguien primero.`,
        );
      }

      const { count } = await tx.inscripcionTorneo.updateMany({
        where: {
          id,
          torneoId,
          estado: EstadoInscripcionTorneo.LISTA_ESPERA,
        },
        data: { estado: EstadoInscripcionTorneo.INSCRITA },
      });

      if (count === 0) {
        throw new NotFoundException(
          'No hay nadie esperando con ese número en este torneo.',
        );
      }

      return { id };
    });
  }

  /**
   * Asigna la siembra de un inscrito.
   *
   * **La pone el admin, no el ranking.** Es lo que hace hoy y lo que le permite
   * separar a dos socios que ya jugaron la final el mes pasado; el ranking se le
   * muestra al lado como sugerencia. Ver `SPEC-torneos.md` § El cuadro se arma una vez.
   */
  async sembrar(
    torneoId: number,
    id: number,
    siembra: number | null,
  ): Promise<{ id: number }> {
    if (siembra !== null) {
      const repetida = await this.prisma.inscripcionTorneo.findFirst({
        where: {
          torneoId,
          siembra,
          estado: EstadoInscripcionTorneo.INSCRITA,
          id: { not: id },
        },
        select: { jugador: { select: { nombre: true, apellido: true } } },
      });

      if (repetida) {
        // Dos sembrados con el mismo número se pisan el lugar del cuadro, y el
        // segundo desaparecería del sorteo sin que nadie lo note.
        throw new ConflictException(
          `El ${siembra} ya es de ${repetida.jugador.nombre} ${repetida.jugador.apellido}.`,
        );
      }
    }

    const { count } = await this.prisma.inscripcionTorneo.updateMany({
      where: { id, torneoId, estado: EstadoInscripcionTorneo.INSCRITA },
      data: { siembra },
    });

    if (count === 0) {
      throw new NotFoundException(
        'No hay un inscrito con ese número en este torneo.',
      );
    }

    return { id };
  }

  /** La lista del torneo, en tres grupos porque son tres cosas distintas. */
  async lista(torneoId: number): Promise<ListaDelTorneo> {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      select: { id: true, cupo: true, estado: true },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');

    const filas = await this.prisma.inscripcionTorneo.findMany({
      where: { torneoId },
      // Por llegada: la lista de espera se atiende en ese orden. Los sembrados suben
      // después, en memoria, porque MySQL pone los nulos **primero** en un `ASC` y
      // ordenar por siembra dejaba a los sembrados al final de la lista, que es justo
      // al revés de como el club lee un cuadro.
      orderBy: [{ inscritaEn: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        jugadorId: true,
        siembra: true,
        estado: true,
        inscritaEn: true,
        jugador: {
          select: {
            nombre: true,
            apellido: true,
            socio: { select: { numeroSocio: true } },
          },
        },
      },
    });

    const inscripciones = ordenarPorSiembra(
      filas.map((fila) => ({
        id: fila.id,
        jugadorId: fila.jugadorId,
        jugador: `${fila.jugador.nombre} ${fila.jugador.apellido}`,
        numeroSocio: fila.jugador.socio?.numeroSocio ?? null,
        siembra: fila.siembra,
        estado: fila.estado,
        inscritaEn: fila.inscritaEn,
      })),
    );

    return {
      torneoId: torneo.id,
      cupo: torneo.cupo,
      estado: torneo.estado,
      inscritos: inscripciones.filter(
        (i) => i.estado === EstadoInscripcionTorneo.INSCRITA,
      ),
      enEspera: inscripciones.filter(
        (i) => i.estado === EstadoInscripcionTorneo.LISTA_ESPERA,
      ),
      retirados: inscripciones.filter(
        (i) => i.estado === EstadoInscripcionTorneo.RETIRADA,
      ),
    };
  }

  /**
   * Toma la fila del torneo como cerrojo y comprueba que se pueda inscribir.
   *
   * `FOR UPDATE` sobre **el torneo**: la fila existe siempre y se toma por clave
   * primaria, así que dos inscripciones al mismo torneo se ponen en fila y las de
   * torneos distintos no se cruzan. Es el mismo mecanismo de `Inscripciones` en
   * `clases` y de `ReservasService.bloquearAlSocio`.
   */
  private async tomarElTorneo(
    tx: Prisma.TransactionClient,
    torneoId: number,
    exigirAbierto = true,
  ): Promise<{ cupo: number }> {
    await tx.$queryRaw`SELECT id FROM torneo WHERE id = ${torneoId} FOR UPDATE`;

    const torneo = await tx.torneo.findUnique({
      where: { id: torneoId },
      select: { cupo: true, estado: true, cierreInscripcion: true },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');

    if (exigirAbierto) {
      if (torneo.estado !== EstadoTorneo.INSCRIPCION) {
        throw new ConflictException(
          'Ese torneo ya no está en inscripción: el cuadro está armado.',
        );
      }

      // El último día de inscripción cuenta entero, como `alDiaHasta` en identidad:
      // la fecha del papel es la última que vale.
      if (torneo.cierreInscripcion < hoyEnElClub()) {
        throw new ConflictException(
          'La inscripción de ese torneo ya se cerró.',
        );
      }
    }

    return { cupo: torneo.cupo };
  }

  private async yaEsta(
    tx: Prisma.TransactionClient,
    torneoId: number,
    jugadorId: number,
  ): Promise<boolean> {
    const cuantas = await tx.inscripcionTorneo.count({
      where: {
        torneoId,
        jugadorId,
        estado: { not: EstadoInscripcionTorneo.RETIRADA },
      },
    });

    return cuantas > 0;
  }
}

/**
 * Los sembrados arriba y en orden; el resto, como llegaron.
 *
 * En memoria y no en el `ORDER BY` porque MySQL pone los nulos primero en un `ASC`:
 * ordenar por siembra dejaba al 1 y al 2 debajo de todos los sin sembrar, que es al
 * revés de como se lee un cuadro.
 */
function ordenarPorSiembra(
  inscripciones: InscripcionPublicada[],
): InscripcionPublicada[] {
  return [...inscripciones].sort((una, otra) => {
    if (una.siembra !== null && otra.siembra !== null) {
      return una.siembra - otra.siembra;
    }

    if (una.siembra !== null) return -1;
    if (otra.siembra !== null) return 1;

    return una.inscritaEn.getTime() - otra.inscritaEn.getTime();
  });
}
