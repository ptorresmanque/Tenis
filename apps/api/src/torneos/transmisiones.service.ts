import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TransmisionPedida } from './transmisiones.dto';
import { urlDeLaMiniatura, urlDelReproductor } from './youtube';

/** Una transmisión como se publica: **con la URL ya armada por el servidor**. */
export interface TransmisionPublicada {
  id: number;
  canchaId: number;
  cancha: string;
  titulo: string | null;
  inicio: Date;
  fin: Date;
  /** La del reproductor, en el dominio sin cookies. Nunca la que pegó el admin. */
  url: string;
  miniatura: string;
}

/**
 * Las transmisiones de un torneo: **una cancha durante una jornada**.
 *
 * El partido resuelve la suya por cancha y hora. La consecuencia hay que decirla porque
 * el visitante la va a ver: **entrar a un partido puede mostrar otro en pantalla**, si
 * el anterior se alargó. La pantalla lo dice —"transmisión de la Cancha 1, en vivo"— en
 * vez de prometer un partido que no está saliendo.
 */
@Injectable()
export class Transmisiones {
  constructor(private readonly prisma: PrismaService) {}

  async listar(torneoId: number): Promise<TransmisionPublicada[]> {
    const filas = await this.prisma.transmision.findMany({
      where: { torneoId },
      orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        canchaId: true,
        titulo: true,
        inicio: true,
        fin: true,
        youtubeVideoId: true,
        cancha: { select: { nombre: true } },
      },
    });

    return filas.map(publicar);
  }

  /**
   * Anuncia un live.
   *
   * **Solo sobre una cancha con cámara.** Es el error que deja al club anunciando un
   * partido que nadie puede ver, y se atrapa en el único lugar donde se puede atrapar.
   */
  async crear(torneoId: number, datos: TransmisionPedida) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      select: { id: true },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');

    const cancha = await this.prisma.cancha.findUnique({
      where: { id: datos.canchaId },
      select: { nombre: true, tieneCamara: true },
    });

    if (!cancha)
      throw new NotFoundException('No hay una cancha con ese número.');

    if (!cancha.tieneCamara) {
      throw new ConflictException(
        `${cancha.nombre} no tiene cámara: no se puede transmitir desde ahí.`,
      );
    }

    // Dos lives de la misma cancha a la misma hora son dos videos peleando por los
    // mismos partidos, y el que resuelva cada partido dependería de cuál lea la base
    // primero.
    const pisado = await this.prisma.transmision.findFirst({
      where: {
        canchaId: datos.canchaId,
        inicio: { lt: datos.fin },
        fin: { gt: datos.inicio },
      },
      select: { titulo: true },
    });

    if (pisado) {
      throw new ConflictException(
        'Esa cancha ya tiene una transmisión que se pisa con esa ventana.',
      );
    }

    const creada = await this.prisma.transmision.create({
      data: { torneoId, ...datos },
      select: {
        id: true,
        canchaId: true,
        titulo: true,
        inicio: true,
        fin: true,
        youtubeVideoId: true,
        cancha: { select: { nombre: true } },
      },
    });

    return publicar(creada);
  }

  async quitar(torneoId: number, id: number): Promise<{ id: number }> {
    const { count } = await this.prisma.transmision.deleteMany({
      where: { id, torneoId },
    });

    if (count === 0) {
      throw new NotFoundException(
        'Ese torneo no tiene una transmisión con ese número.',
      );
    }

    return { id };
  }

  /**
   * La transmisión que cubre a este partido, si la hay.
   *
   * **Por cancha y hora, no por una columna en `Partido`.** Un enlace guardado en el
   * partido habría que escribirlo ocho veces por jornada y se quedaría desactualizado
   * el día que el club rehaga el live; la ventana responde sola.
   *
   * Un partido **sin programar no tiene transmisión**: no se sabe dónde ni cuándo se
   * juega, así que no hay con qué buscarla.
   */
  async delPartido(partidoId: number): Promise<TransmisionPublicada | null> {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
      select: {
        programadoInicio: true,
        bloqueo: { select: { canchaId: true } },
      },
    });

    if (!partido?.programadoInicio || !partido.bloqueo) return null;

    const transmision = await this.prisma.transmision.findFirst({
      where: {
        canchaId: partido.bloqueo.canchaId,
        inicio: { lte: partido.programadoInicio },
        fin: { gt: partido.programadoInicio },
      },
      select: {
        id: true,
        canchaId: true,
        titulo: true,
        inicio: true,
        fin: true,
        youtubeVideoId: true,
        cancha: { select: { nombre: true } },
      },
    });

    return transmision ? publicar(transmision) : null;
  }
}

/**
 * De la fila a lo que se publica.
 *
 * **La URL se arma acá y el id no sale nunca solo.** Es lo que impide que una pantalla
 * concatene el valor guardado con otro dominio y se salte el `youtube-nocookie`.
 */
function publicar(fila: {
  id: number;
  canchaId: number;
  titulo: string | null;
  inicio: Date;
  fin: Date;
  youtubeVideoId: string;
  cancha: { nombre: string };
}): TransmisionPublicada {
  return {
    id: fila.id,
    canchaId: fila.canchaId,
    cancha: fila.cancha.nombre,
    titulo: fila.titulo,
    inicio: fila.inicio,
    fin: fila.fin,
    url: urlDelReproductor(fila.youtubeVideoId),
    miniatura: urlDeLaMiniatura(fila.youtubeVideoId),
  };
}
