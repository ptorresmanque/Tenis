import { Injectable, Logger } from '@nestjs/common';

import { ZONA_DEL_CLUB } from '../comun/tiempo';
import { web } from '../comun/urls';
import { EnviadorCorreo, enviarOAnotar } from '../identidad/correo';
import { PrismaService } from '../prisma/prisma.service';
import { VentanasDelClub } from './ventanas';

/** Lo que la firma necesita del club: lo que el admin carga en "Datos del club". */
export interface DatosDelClub {
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  latitud: number | null;
  longitud: number | null;
}

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
 * La firma de todo correo del club (T108; la reutilizan T109 a T112).
 *
 * Lo que el club no cargó no aparece, ni como línea vacía ni como separador suelto. "Cómo
 * llegar" va a Google Maps con el destino puesto, como el botón de "El club" (T101): en un
 * correo es lo que se abre desde el teléfono camino a la cancha.
 */
export function firmaDelClub(club: DatosDelClub): string {
  const contacto = [club.telefono, club.email].filter(Boolean).join(' · ');
  const comoLlegar =
    club.latitud !== null && club.longitud !== null
      ? 'Cómo llegar: https://www.google.com/maps/dir/?api=1&destination=' +
        `${club.latitud},${club.longitud}`
      : '';

  // "-- " con el espacio: es el separador de firma que los clientes de correo reconocen.
  return ['-- ', club.nombre, club.direccion, contacto, comoLlegar]
    .filter(Boolean)
    .join('\n');
}

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

/**
 * Los correos de una reserva, armados desde la base y enviados sin poner en juego la
 * reserva: se llaman después de confirmarla, y si algo falla —la consulta o el envío—
 * queda en el log con el folio y la reserva sigue confirmada.
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
    let folio = `la reserva ${reservaId}`;

    try {
      const [reserva, club] = await Promise.all([
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
      folio = reserva.folio;

      const { asunto, cuerpo } = confirmacionDeReserva(
        {
          folio: reserva.folio,
          token: reserva.token,
          cancha: reserva.cancha.nombre,
          inicio: reserva.inicio,
          fin: reserva.fin,
          nombre: reserva.nombre,
          conQuien: reserva.acompanantes.map(({ nombre, socio }) =>
            socio
              ? `${socio.usuario.nombre} ${socio.usuario.apellido}`
              : (nombre ?? ''),
          ),
          deSocio: reserva.socioId !== null,
        },
        // La misma fila trae los datos del club y sus ventanas de cambio y devolución.
        club,
        club,
        web(),
      );

      await enviarOAnotar(
        this.correo,
        { para: reserva.email, asunto, cuerpo },
        this.log,
        `No salió la confirmación de ${folio}`,
      );
    } catch (falla) {
      this.log.error(
        `No se pudo armar la confirmación de ${folio}: ${String(falla)}`,
      );
    }
  }
}
