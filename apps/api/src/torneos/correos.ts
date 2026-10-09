import { Injectable, Logger } from '@nestjs/common';

import { DatosDelClub, firmaDelClub } from '../comun/club';
import { web } from '../comun/urls';
import {
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  MedioPagoInscripcion,
} from '../generated/prisma/client';
import { EnviadorCorreo, enviarOAnotar } from '../identidad/correo';
import { PrismaService } from '../prisma/prisma.service';

/** Un comprobante recién llegado, con lo que su aviso dice. */
export interface ComprobanteParaRevisar {
  torneoId: number;
  /** El cuadro de su categoría: el enlace abre el panel ahí. */
  cuadroId: number;
  torneo: string;
  categoria: string;
  jugador: string;
  montoClp: number;
}

/**
 * El aviso a los administradores de que llegó un comprobante (T130, decisión 3 de la
 * sexta parte). El asunto lleva quién y qué categoría, que es lo que se busca en la
 * bandeja; el enlace abre los inscritos de esa categoría, donde se confirma o se rechaza.
 */
export function avisoDeComprobante(
  comprobante: ComprobanteParaRevisar,
  club: DatosDelClub,
  origenWeb: string,
): { asunto: string; cuerpo: string } {
  return {
    asunto: `Comprobante por revisar: ${comprobante.jugador}, ${comprobante.categoria}`,
    cuerpo:
      'Hola:\n\n' +
      'Llegó un comprobante de transferencia para revisar.\n\n' +
      `Torneo: ${comprobante.torneo}\n` +
      `Categoría: ${comprobante.categoria}\n` +
      `Jugador: ${comprobante.jugador}\n` +
      `Monto: $${comprobante.montoClp.toLocaleString('es-CL')}\n\n` +
      'Míralo y confírmalo o recházalo desde el panel:\n' +
      `${origenWeb}/administracion/torneos/${comprobante.torneoId}` +
      `?cuadro=${comprobante.cuadroId}\n\n` +
      firmaDelClub(club),
  };
}

/** Una inscripción, con lo que dicen los correos al inscrito (T131). */
export interface InscripcionParaAvisar {
  /** El nombre del jugador, para el saludo. */
  nombre: string;
  torneo: string;
  categoria: string;
  montoClp: number;
  estado: EstadoInscripcionTorneo;
  estadoPago: EstadoPagoInscripcion;
  medioPago: MedioPagoInscripcion | null;
  motivoRechazo: string | null;
}

type Correo = { asunto: string; cuerpo: string };

const pesos = (monto: number) => `$${monto.toLocaleString('es-CL')}`;

/**
 * "Quedaste inscrito", o la lista de espera: lo que el inscrito tiene que saber primero.
 * Nada si ya salió del cuadro: el club puede confirmar el pago de alguien que retiró.
 */
function dondeQuedo(inscripcion: InscripcionParaAvisar): string {
  switch (inscripcion.estado) {
    case 'INSCRITA':
      return `Quedaste inscrito en ${inscripcion.categoria} de ${inscripcion.torneo}.`;
    case 'LISTA_ESPERA':
      return (
        `${inscripcion.categoria} ya llenó su cuadro: quedaste en la lista de espera, ` +
        'y el club te llama si se libera un lugar.'
      );
    case 'RETIRADA':
      return '';
  }
}

/** El pie de los correos al inscrito: dónde ver el torneo, y la firma. */
function pie(club: DatosDelClub, origenWeb: string): string {
  return (
    `El torneo y su cuadro están en ${origenWeb}/torneos\n\n` +
    firmaDelClub(club)
  );
}

/**
 * "Inscripción recibida" (T131, A4): dónde quedó y qué falta del pago.
 *
 * Con Webpay no se manda: al inscribirse el cupo es una reserva que se suelta a los 15
 * minutos si no paga, y la confirmación es el "pago confirmado".
 */
export function inscripcionRecibida(
  inscripcion: InscripcionParaAvisar,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  const pago =
    inscripcion.estadoPago !== 'PENDIENTE'
      ? ''
      : inscripcion.medioPago === 'TRANSFERENCIA'
        ? 'El club está revisando tu comprobante de transferencia y te avisa por ' +
          'correo cuando lo confirme.\n\n'
        : `Falta pagar la inscripción (${pesos(inscripcion.montoClp)}): puedes ` +
          'hacerlo en el club.\n\n';

  return {
    asunto: `Inscripción recibida: ${inscripcion.torneo}, ${inscripcion.categoria}`,
    cuerpo:
      `Hola ${inscripcion.nombre}:\n\n` +
      `Recibimos tu inscripción. ${dondeQuedo(inscripcion)}\n\n` +
      pago +
      pie(club, origenWeb),
  };
}

/** "Pago confirmado" (T131): el club aprobó el comprobante o Webpay autorizó el cobro. */
export function pagoAprobado(
  inscripcion: InscripcionParaAvisar,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  return {
    asunto: `Pago confirmado: ${inscripcion.torneo}, ${inscripcion.categoria}`,
    cuerpo:
      `Hola ${inscripcion.nombre}:\n\n` +
      `Te confirmamos el pago de tu inscripción (${pesos(inscripcion.montoClp)}). ` +
      `${dondeQuedo(inscripcion)}\n\n` +
      pie(club, origenWeb),
  };
}

/** "Pago rechazado" (T131): con el motivo, y que rechazar soltó su lugar. */
export function pagoRechazado(
  inscripcion: InscripcionParaAvisar,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  return {
    asunto: `Pago rechazado: ${inscripcion.torneo}, ${inscripcion.categoria}`,
    cuerpo:
      `Hola ${inscripcion.nombre}:\n\n` +
      `El club no pudo confirmar el pago de tu inscripción a ${inscripcion.categoria} ` +
      `de ${inscripcion.torneo}, así que tu lugar en el cuadro quedó libre.\n\n` +
      (inscripcion.motivoRechazo
        ? `Motivo: ${inscripcion.motivoRechazo}\n\n`
        : '') +
      'Si crees que es un error, escríbenos o llámanos y lo revisamos.\n\n' +
      pie(club, origenWeb),
  };
}

/**
 * Los correos de un torneo, armados desde la base y enviados sin poner en juego la
 * inscripción: se llaman con la inscripción ya escrita, y si algo falla —la consulta o el
 * envío— queda en el log y la inscripción sigue como quedó.
 */
@Injectable()
export class AvisosDeTorneo {
  private readonly log = new Logger('Correo');

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: EnviadorCorreo,
  ) {}

  /**
   * Llegó un comprobante: un correo a **cada** administrador (decisión 3).
   *
   * Lo llama quien recibió la imagen del jugador —al inscribirse transfiriendo, o con su
   * llave después—, nunca el admin que la sube desde el panel: ese ya la tiene en la mano.
   */
  async comprobanteRecibido(inscripcionId: number): Promise<void> {
    try {
      const [fila, admins, club] = await Promise.all([
        this.prisma.inscripcionTorneo.findUniqueOrThrow({
          where: { id: inscripcionId },
          select: {
            torneoId: true,
            torneoCategoriaId: true,
            torneo: { select: { nombre: true } },
            torneoCategoria: {
              select: {
                montoInscripcionClp: true,
                categoriaJuego: { select: { nombre: true } },
              },
            },
            jugador: { select: { nombre: true, apellido: true } },
          },
        }),
        this.prisma.usuario.findMany({
          where: { esAdmin: true },
          select: { email: true },
        }),
        this.prisma.configuracionClub.findFirstOrThrow(),
      ]);

      const correo = avisoDeComprobante(
        {
          torneoId: fila.torneoId,
          cuadroId: fila.torneoCategoriaId,
          torneo: fila.torneo.nombre,
          categoria: fila.torneoCategoria.categoriaJuego.nombre,
          jugador: `${fila.jugador.nombre} ${fila.jugador.apellido}`,
          montoClp: fila.torneoCategoria.montoInscripcionClp,
        },
        club,
        web(),
      );

      // Uno por admin y no uno con todos en copia: cada uno ve solo su dirección, y un
      // correo que rebota no se lleva a los demás.
      for (const { email } of admins) {
        await enviarOAnotar(
          this.correo,
          { para: email, ...correo },
          this.log,
          `No salió el aviso del comprobante de la inscripción ${inscripcionId} para ${email}`,
        );
      }
    } catch (falla) {
      this.log.error(
        `No se pudo armar el aviso del comprobante de la inscripción ${inscripcionId}: ` +
          String(falla),
      );
    }
  }

  /** "Inscripción recibida" (T131). Ver `inscripcionRecibida`. */
  async inscripcionRecibida(inscripcionId: number): Promise<void> {
    await this.alInscrito(
      inscripcionId,
      'la inscripción recibida',
      inscripcionRecibida,
    );
  }

  /** "Pago confirmado" (T131), por el club o por Webpay. */
  async pagoAprobado(inscripcionId: number): Promise<void> {
    await this.alInscrito(inscripcionId, 'el pago confirmado', pagoAprobado);
  }

  /** "Pago rechazado" (T131), con el motivo que escribió el club. */
  async pagoRechazado(inscripcionId: number): Promise<void> {
    await this.alInscrito(inscripcionId, 'el pago rechazado', pagoRechazado);
  }

  /**
   * Carga la inscripción y el club, arma el correo y se lo manda al inscrito.
   *
   * **A quién:** al correo de la inscripción (T127) y, si no tiene, al de la cuenta del
   * socio, para el que anotó el admin sin escribirlo. Sin ninguno —las inscripciones de
   * antes de T127— no sale nada, y no es un error.
   */
  private async alInscrito(
    inscripcionId: number,
    que: string,
    armar: (
      inscripcion: InscripcionParaAvisar,
      club: DatosDelClub,
      origenWeb: string,
    ) => Correo,
  ): Promise<void> {
    try {
      const [fila, club] = await Promise.all([
        this.prisma.inscripcionTorneo.findUniqueOrThrow({
          where: { id: inscripcionId },
          select: {
            email: true,
            estado: true,
            estadoPago: true,
            medioPago: true,
            motivoRechazo: true,
            torneo: { select: { nombre: true } },
            torneoCategoria: {
              select: {
                montoInscripcionClp: true,
                categoriaJuego: { select: { nombre: true } },
              },
            },
            jugador: {
              select: {
                nombre: true,
                socio: { select: { usuario: { select: { email: true } } } },
              },
            },
          },
        }),
        this.prisma.configuracionClub.findFirstOrThrow(),
      ]);

      const para = fila.email ?? fila.jugador.socio?.usuario.email ?? null;
      if (para === null) return;

      const correo = armar(
        {
          nombre: fila.jugador.nombre,
          torneo: fila.torneo.nombre,
          categoria: fila.torneoCategoria.categoriaJuego.nombre,
          montoClp: fila.torneoCategoria.montoInscripcionClp,
          estado: fila.estado,
          estadoPago: fila.estadoPago,
          medioPago: fila.medioPago,
          motivoRechazo: fila.motivoRechazo,
        },
        club,
        web(),
      );

      await enviarOAnotar(
        this.correo,
        { para, ...correo },
        this.log,
        `No salió ${que} de la inscripción ${inscripcionId}`,
      );
    } catch (falla) {
      this.log.error(
        `No se pudo armar ${que} de la inscripción ${inscripcionId}: ${String(falla)}`,
      );
    }
  }
}
