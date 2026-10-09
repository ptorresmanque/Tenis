import { Injectable, Logger } from '@nestjs/common';

import { DatosDelClub, firmaDelClub } from '../comun/club';
import { ZONA_DEL_CLUB } from '../comun/tiempo';
import { web } from '../comun/urls';
import { EnviadorCorreo, enviarOAnotar } from '../identidad/correo';
import { PrismaService } from '../prisma/prisma.service';
import { VentanasDelClub } from './ventanas';

/** Una reserva recién confirmada, con lo que su correo dice. */
export interface ReservaParaAvisar {
  folio: string;
  token: string;
  cancha: string;
  inicio: Date;
  fin: Date;
  /** El titular, a quien va el correo (A7). */
  nombre: string;
  /** Los acompañantes por su nombre: socios e invitados. */
  conQuien: string[];
  /** El socio cambia y cancela desde "Mis reservas"; el visitante, desde su enlace. */
  deSocio: boolean;
}

const DIA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const HORA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const LISTA = new Intl.ListFormat('es', { type: 'conjunction' });

/**
 * La confirmación de una reserva (T108): qué, cuándo, con quién, el enlace y la regla de
 * cambio. El asunto lleva el día y la hora, que es lo que se busca después en la bandeja.
 */
export function confirmacionDeReserva(
  reserva: ReservaParaAvisar,
  club: DatosDelClub,
  ventanas: VentanasDelClub,
  origenWeb: string,
): { asunto: string; cuerpo: string } {
  const dia = DIA.format(reserva.inicio);
  const desde = HORA.format(reserva.inicio);

  const regla = reserva.deSocio
    ? `Puedes cambiar la hora o la duración desde "Mis reservas" hasta ` +
      `${ventanas.horasMinModificacion} horas antes, y cancelarla desde ahí mismo.`
    : `Puedes cambiar la hora o la duración desde ese enlace hasta ` +
      `${ventanas.horasMinModificacion} horas antes. Si necesitas cancelarla, escríbenos: ` +
      `con ${ventanas.horasReembolsoTotal} horas o más de anticipación te devolvemos ` +
      'todo lo que pagaste.';

  return {
    asunto: `Reserva confirmada: ${dia}, a las ${desde}`,
    cuerpo:
      `Hola ${reserva.nombre}:\n\n` +
      'Tu reserva quedó confirmada.\n\n' +
      `Folio: ${reserva.folio}\n` +
      `Cancha: ${reserva.cancha}\n` +
      `Día: ${dia}\n` +
      `Hora: de ${desde} a ${HORA.format(reserva.fin)} (${duracion(reserva)})\n` +
      (reserva.conQuien.length > 0
        ? `Juegas con: ${LISTA.format(reserva.conQuien)}\n`
        : '') +
      '\nTu reserva y el código QR para la entrada:\n' +
      `${origenWeb}/r/${reserva.token}\n\n` +
      `${regla}\n\n` +
      firmaDelClub(club),
  };
}

function duracion({ inicio, fin }: { inicio: Date; fin: Date }): string {
  const minutos = Math.round((fin.getTime() - inicio.getTime()) / 60_000);

  if (minutos === 60) return '1 hora';
  if (minutos === 90) return '1 hora y media';
  return `${minutos} minutos`;
}

/** Dónde y cuándo estaba la reserva antes de un cambio. */
export interface HoraDeLaReserva {
  cancha: string;
  inicio: Date;
  fin: Date;
}

/**
 * El aviso de un cambio (T109): la hora de antes y la de después, para que el dueño de la
 * reserva se entere aunque el cambio lo haya hecho otro con su enlace, o el club.
 */
export function avisoDeCambio(
  reserva: ReservaParaAvisar,
  antes: HoraDeLaReserva,
  club: DatosDelClub,
  origenWeb: string,
): { asunto: string; cuerpo: string } {
  return {
    asunto: `Tu reserva ${reserva.folio} cambió`,
    cuerpo:
      `Hola ${reserva.nombre}:\n\n` +
      `Tu reserva ${reserva.folio} cambió.\n\n` +
      `Antes: ${dondeYCuando(antes)}\n` +
      `Ahora: ${dondeYCuando(reserva)}\n\n` +
      'Tu reserva y el código QR para la entrada:\n' +
      `${origenWeb}/r/${reserva.token}\n\n` +
      'Si no pediste este cambio, escríbenos y lo revisamos.\n\n' +
      firmaDelClub(club),
  };
}

function dondeYCuando(hora: HoraDeLaReserva): string {
  return (
    `${hora.cancha}, ${DIA.format(hora.inicio)}, de ${HORA.format(hora.inicio)} a ` +
    `${HORA.format(hora.fin)} (${duracion(hora)})`
  );
}

/**
 * Los correos de una reserva, armados desde la base y enviados sin poner en juego la
 * reserva: se llaman después de confirmarla o moverla, y si algo falla —la consulta o el
 * envío— queda en el log con el folio y la reserva sigue como quedó.
 */
@Injectable()
export class AvisosDeReserva {
  private readonly log = new Logger('Correo');

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: EnviadorCorreo,
  ) {}

  /** La confirmación al titular (T108). */
  async confirmacion(reservaId: number): Promise<void> {
    await this.avisar(reservaId, 'la confirmación', ({ reserva, club }) =>
      confirmacionDeReserva(reserva, club, club, web()),
    );
  }

  /**
   * El aviso de un cambio (T109), **solo si la reserva es de un visitante**: el socio ve
   * sus horas en "Mis reservas", y su reserva no se mueve con un enlace reenviado.
   *
   * @param antes Dónde y cuándo estaba, con la cancha por su id: la reserva ya se movió.
   */
  async cambio(
    reservaId: number,
    antes: { canchaId: number; inicio: Date; fin: Date },
  ): Promise<void> {
    await this.avisar(
      reservaId,
      'el aviso de cambio',
      async ({ reserva, club }) => {
        if (reserva.deSocio) return null;

        const cancha = await this.prisma.cancha.findUniqueOrThrow({
          where: { id: antes.canchaId },
          select: { nombre: true },
        });

        // Elegir de nuevo la misma hora no cambia nada: la grilla de mover muestra libre la
        // hora propia, y un "cambió" con el antes igual al ahora solo asusta.
        const igual =
          cancha.nombre === reserva.cancha &&
          antes.inicio.getTime() === reserva.inicio.getTime() &&
          antes.fin.getTime() === reserva.fin.getTime();
        if (igual) return null;

        return avisoDeCambio(
          reserva,
          { ...antes, cancha: cancha.nombre },
          club,
          web(),
        );
      },
    );
  }

  /**
   * Carga la reserva y el club, arma el correo y lo manda. Nada de esto puede deshacer lo
   * que ya pasó con la reserva: si falla, queda en el log con el folio.
   */
  private async avisar(
    reservaId: number,
    que: string,
    armar: (datos: {
      reserva: ReservaParaAvisar;
      club: DatosDelClub & VentanasDelClub;
    }) =>
      | { asunto: string; cuerpo: string }
      | null
      | Promise<{ asunto: string; cuerpo: string } | null>,
  ): Promise<void> {
    let folio = `la reserva ${reservaId}`;

    try {
      const [fila, club] = await Promise.all([
        this.prisma.reserva.findUniqueOrThrow({
          where: { id: reservaId },
          select: {
            folio: true,
            token: true,
            inicio: true,
            fin: true,
            nombre: true,
            email: true,
            socioId: true,
            cancha: { select: { nombre: true } },
            acompanantes: {
              select: {
                nombre: true,
                socio: {
                  select: {
                    usuario: { select: { nombre: true, apellido: true } },
                  },
                },
              },
              orderBy: { id: 'asc' },
            },
          },
        }),
        this.prisma.configuracionClub.findFirstOrThrow(),
      ]);
      folio = fila.folio;

      const correo = await armar({
        reserva: {
          folio: fila.folio,
          token: fila.token,
          cancha: fila.cancha.nombre,
          inicio: fila.inicio,
          fin: fila.fin,
          nombre: fila.nombre,
          conQuien: fila.acompanantes.map(({ nombre, socio }) =>
            socio
              ? `${socio.usuario.nombre} ${socio.usuario.apellido}`
              : (nombre ?? ''),
          ),
          deSocio: fila.socioId !== null,
        },
        club,
      });

      if (correo === null) return;

      await enviarOAnotar(
        this.correo,
        { para: fila.email, ...correo },
        this.log,
        `No salió ${que} de ${folio}`,
      );
    } catch (falla) {
      this.log.error(`No se pudo armar ${que} de ${folio}: ${String(falla)}`);
    }
  }
}
