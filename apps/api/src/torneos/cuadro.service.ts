import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  EstadoTorneo,
  type Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InscripcionesAbandonadas } from './inscripciones-abandonadas.service';
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
  /** Cuándo y dónde se juega (T67). Nulos mientras nadie lo programe. */
  programadoInicio: Date | null;
  programadoFin: Date | null;
  canchaId: number | null;
  cancha: string | null;
}

export interface CuadroPublicado {
  torneoId: number;
  torneoCategoriaId: number;
  categoria: string;
  estado: EstadoTorneo;
  armado: boolean;
  rondas: number;
  semillaSorteo: number | null;
  partidos: PartidoPublicado[];
}

/**
 * Armar y mostrar **un** cuadro: el de una categoría dentro de un torneo.
 *
 * El cálculo vive en `cuadro.ts`, que es puro y se prueba solo — y que **no cambió en
 * T62**: ya recibía una lista de participantes y no sabía de torneos. Lo que cambió es
 * quién lo llama y cuántas veces.
 *
 * **Un cuadro está armado si tiene partidos**, y no hay una columna que lo diga. Un
 * booleano al lado de los partidos es un dato que puede quedar en desacuerdo con ellos;
 * la pregunta "¿ya se armó?" se responde mirando lo que se creó al armarlo.
 */
@Injectable()
export class CuadroDelTorneo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abandonadas: InscripcionesAbandonadas,
  ) {}

  /**
   * Arma el cuadro de una categoría.
   *
   * **Armar Honor no toca la 4ª.** Cada cuadro tiene su propia semilla en
   * `TorneoCategoria`, así que rearmar uno no vuelve a sortear el otro — que era
   * exactamente lo que pasaba con una semilla única del torneo.
   */
  async armar(torneoCategoriaId: number): Promise<CuadroPublicado> {
    const cuadro = await this.elCuadro(this.prisma, torneoCategoriaId);

    if (cuadro.torneo.estado === EstadoTorneo.CANCELADO) {
      throw new ConflictException(
        'Ese torneo está cancelado: no se le arman cuadros.',
      );
    }

    // Antes de contarlos: el que eligió Webpay y cerró la ventana de pago no es un
    // pendiente que el club tenga que resolver, es un cupo que hay que soltar. Sin
    // esto, armar el cuadro fallaba pidiéndole al admin que aprobara o rechazara una
    // inscripción fantasma, sin comprobante que mirar.
    await this.abandonadas.liberar({ torneoCategoriaId });

    // **Un pago pendiente no entra al cuadro.** El club resuelve la bandeja antes de
    // armar: un cuadro con un pago sin confirmar es un jugador que puede no presentarse
    // y un lugar que alguien de la lista de espera podría haber tomado.
    const pendientes = await this.prisma.inscripcionTorneo.count({
      where: {
        torneoCategoriaId,
        estado: EstadoInscripcionTorneo.INSCRITA,
        estadoPago: EstadoPagoInscripcion.PENDIENTE,
      },
    });

    if (pendientes > 0) {
      throw new ConflictException(
        `${pendientes} ${pendientes === 1 ? 'inscripción tiene' : 'inscripciones tienen'} ` +
          'el pago sin confirmar. Apruébalos o recházalos antes de armar el cuadro.',
      );
    }

    const inscritos = await this.prisma.inscripcionTorneo.findMany({
      where: {
        torneoCategoriaId,
        estado: EstadoInscripcionTorneo.INSCRITA,
      },
      orderBy: { inscritaEn: 'asc' },
      select: { jugadorId: true, siembra: true },
    });

    if (inscritos.length < 2) {
      throw new ConflictException(
        `Hacen falta al menos dos jugadores inscritos en ${cuadro.categoriaJuego.nombre} para armar su cuadro.`,
      );
    }

    const semilla = Math.floor(Math.random() * 2 ** 31);
    const partidos = armarCuadro(inscritos, semilla);

    await this.prisma.$transaction(async (tx) => {
      // **La semilla se escribe con `where: { semillaSorteo: null }` y se comprueba el
      // `count` acá dentro**, no antes de entrar: dos admins armando el mismo cuadro a
      // la vez pasaban los dos la comprobación de afuera, y el segundo se estrellaba
      // contra el único de `partido` con un 500. Ahora el segundo lee "ya está
      // armado", que es lo que pasó.
      const { count } = await tx.torneoCategoria.updateMany({
        where: { id: torneoCategoriaId, semillaSorteo: null },
        data: { semillaSorteo: semilla },
      });

      if (count === 0) {
        throw new ConflictException(
          `El cuadro de ${cuadro.categoriaJuego.nombre} ya está armado. Para rehacerlo, deshazlo primero.`,
        );
      }

      // Los partidos y la semilla, o ninguna de las dos cosas: un cuadro con semilla y
      // sin partidos es una pantalla en blanco donde la gente busca su cruce.
      await tx.partido.createMany({
        data: partidos.map((partido) => ({
          ...partido,
          torneoId: cuadro.torneoId,
          torneoCategoriaId,
        })),
      });

      await this.ponerEstadoDelTorneo(tx, cuadro.torneoId);
    });

    return this.leer(torneoCategoriaId);
  }

  /**
   * Deshace **este** cuadro y lo devuelve a inscripción.
   *
   * **Solo mientras no haya resultados cargados en él.** Rearmar un cuadro con partidos
   * jugados es rehacer la historia: alguien ganó de verdad y su partido desaparecería.
   * Los otros cuadros del torneo no se tocan.
   */
  async deshacer(
    torneoCategoriaId: number,
  ): Promise<{ torneoCategoriaId: number }> {
    const cuadro = await this.elCuadro(this.prisma, torneoCategoriaId);

    await this.prisma.$transaction(async (tx) => {
      // Contar adentro y no antes: entre la cuenta y el borrado cabe un resultado, y
      // ese partido se iría con el resto sin que nadie lo note.
      const jugados = await tx.partido.count({
        where: { torneoCategoriaId, marcador: { not: null } },
      });

      if (jugados > 0) {
        throw new ConflictException(
          `Ese cuadro ya tiene ${jugados} ${jugados === 1 ? 'partido jugado' : 'partidos jugados'}: ` +
            'rehacerlo borraría resultados que ya pasaron.',
        );
      }

      await tx.partido.deleteMany({ where: { torneoCategoriaId } });
      await tx.torneoCategoria.update({
        where: { id: torneoCategoriaId },
        data: { semillaSorteo: null },
      });

      await this.ponerEstadoDelTorneo(tx, cuadro.torneoId);
    });

    return { torneoCategoriaId };
  }

  /** El cuadro entero, para dibujarlo. */
  async leer(torneoCategoriaId: number): Promise<CuadroPublicado> {
    const cuadro = await this.elCuadro(this.prisma, torneoCategoriaId);

    const partidos = await this.prisma.partido.findMany({
      where: { torneoCategoriaId },
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
        programadoInicio: true,
        programadoFin: true,
        jugadorA: { select: { nombre: true, apellido: true } },
        jugadorB: { select: { nombre: true, apellido: true } },
        // La cancha sale del bloqueo y no de una columna propia: el bloqueo **es** la
        // reserva de la cancha, y guardar el id al lado sería un segundo dato que
        // puede quedar en desacuerdo con él.
        bloqueo: {
          select: { canchaId: true, cancha: { select: { nombre: true } } },
        },
      },
    });

    const rondas = partidos.reduce(
      (mayor, partido) => Math.max(mayor, partido.ronda),
      0,
    );

    return {
      torneoId: cuadro.torneoId,
      torneoCategoriaId,
      categoria: cuadro.categoriaJuego.nombre,
      estado: cuadro.torneo.estado,
      armado: partidos.length > 0,
      rondas,
      semillaSorteo: cuadro.semillaSorteo,
      partidos: partidos.map((partido) => ({
        id: partido.id,
        ronda: partido.ronda,
        // El nombre se calcula al mostrar y no se guarda: "cuartos" depende del
        // tamaño del cuadro —y ahora también de la categoría, porque los cuadros de un
        // mismo torneo tienen tamaños distintos—, así que guardarlo obligaría a
        // recalcularlo cada vez que uno cambia.
        ronda_nombre: nombreDeRonda(partido.ronda, rondas),
        posicion: partido.posicion,
        jugadorA: nombre(partido.jugadorA),
        jugadorB: nombre(partido.jugadorB),
        jugadorAId: partido.jugadorAId,
        jugadorBId: partido.jugadorBId,
        ganadorId: partido.ganadorId,
        marcador: partido.marcador,
        walkover: partido.walkover,
        programadoInicio: partido.programadoInicio,
        programadoFin: partido.programadoFin,
        canchaId: partido.bloqueo?.canchaId ?? null,
        cancha: partido.bloqueo?.cancha.nombre ?? null,
      })),
    };
  }

  private async elCuadro(
    db: PrismaService | Prisma.TransactionClient,
    id: number,
  ) {
    const cuadro = await db.torneoCategoria.findUnique({
      where: { id },
      select: {
        id: true,
        torneoId: true,
        semillaSorteo: true,
        categoriaJuego: { select: { nombre: true } },
        torneo: { select: { estado: true } },
      },
    });

    if (!cuadro) {
      throw new NotFoundException('No hay un cuadro con ese número.');
    }

    return cuadro;
  }

  /**
   * El estado del torneo se **deriva** de sus cuadros, no se decide suelto.
   *
   * `INSCRIPCION` mientras quede un cuadro sin armar, `CUADRO_ARMADO` cuando todos lo
   * están. Un torneo con Honor listo y la 4ª todavía inscribiendo sigue abierto: es lo
   * que se publica en el calendario, y decir "cuadro armado" ahí mandaría a la gente de
   * la 4ª a buscar un cruce que no existe.
   *
   * **`FINALIZADO` y `CANCELADO` no se tocan acá.** El primero lo pone `resultados`
   * cuando cae la última final; el segundo es una decisión del club que ningún cuadro
   * puede deshacer.
   */
  private async ponerEstadoDelTorneo(
    tx: Prisma.TransactionClient,
    torneoId: number,
  ): Promise<void> {
    const sinArmar = await tx.torneoCategoria.count({
      where: { torneoId, semillaSorteo: null },
    });

    await tx.torneo.updateMany({
      where: {
        id: torneoId,
        estado: {
          in: [EstadoTorneo.INSCRIPCION, EstadoTorneo.CUADRO_ARMADO],
        },
      },
      data: {
        estado:
          sinArmar === 0
            ? EstadoTorneo.CUADRO_ARMADO
            : EstadoTorneo.INSCRIPCION,
      },
    });
  }
}

function nombre(
  jugador: { nombre: string; apellido: string } | null,
): string | null {
  return jugador ? `${jugador.nombre} ${jugador.apellido}` : null;
}
