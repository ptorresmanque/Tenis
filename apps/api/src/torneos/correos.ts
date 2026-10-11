import { Injectable, Logger } from '@nestjs/common';

import { DatosDelClub, firmaDelClub } from '../comun/club';
import { ZONA_DEL_CLUB } from '../comun/tiempo';
import { web } from '../comun/urls';
import {
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  MedioPagoInscripcion,
} from '../generated/prisma/client';
import { EnviadorCorreo, enviarOAnotar } from '../identidad/correo';
import { PrismaService } from '../prisma/prisma.service';
import { nombreDeRonda } from './cuadro';

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

/** Un partido, visto por uno de sus dos jugadores (T133). */
export interface PartidoParaAvisar {
  /** A quién va: su nombre, para el saludo. */
  nombre: string;
  rival: string;
  torneo: string;
  categoria: string;
  /** "Final", "Semifinal"…: ver `nombreDeRonda`. */
  ronda: string;
}

/** Dónde y cuándo se juega un partido. */
export interface HoraDelPartido {
  cancha: string;
  inicio: Date;
  fin: Date;
}

// Los mismos formatos que los correos de reservas: "sábado, 4 de diciembre" y "10:00".
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

function dondeYCuando(hora: HoraDelPartido): string {
  return (
    `${hora.cancha}, ${DIA.format(hora.inicio)}, de ${HORA.format(hora.inicio)} a ` +
    HORA.format(hora.fin)
  );
}

/** Lo que el jugador tiene que saber de su partido, en las líneas de siempre. */
function elPartido(partido: PartidoParaAvisar): string {
  return (
    `Rival: ${partido.rival}\n` +
    `Ronda: ${partido.ronda} de ${partido.categoria}\n` +
    `Torneo: ${partido.torneo}\n`
  );
}

/** "Tu partido" (T133): el club lo programó. El día y la hora van en el asunto. */
export function partidoProgramado(
  partido: PartidoParaAvisar,
  ahora: HoraDelPartido,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  return {
    asunto: `Tu partido: ${DIA.format(ahora.inicio)}, a las ${HORA.format(ahora.inicio)}`,
    cuerpo:
      `Hola ${partido.nombre}:\n\n` +
      'El club programó tu partido.\n\n' +
      elPartido(partido) +
      `Cancha: ${ahora.cancha}\n` +
      `Día: ${DIA.format(ahora.inicio)}\n` +
      `Hora: de ${HORA.format(ahora.inicio)} a ${HORA.format(ahora.fin)}\n\n` +
      pie(club, origenWeb),
  };
}

/** "Tu partido cambió" (T133): lo de antes y lo de ahora, como el cambio de una reserva. */
export function partidoCambiado(
  partido: PartidoParaAvisar,
  antes: HoraDelPartido,
  ahora: HoraDelPartido,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  return {
    asunto:
      `Tu partido cambió: ${DIA.format(ahora.inicio)}, ` +
      `a las ${HORA.format(ahora.inicio)}`,
    cuerpo:
      `Hola ${partido.nombre}:\n\n` +
      'El club cambió tu partido.\n\n' +
      elPartido(partido) +
      `Antes: ${dondeYCuando(antes)}\n` +
      `Ahora: ${dondeYCuando(ahora)}\n\n` +
      pie(club, origenWeb),
  };
}

/** "Tu partido quedó sin hora" (T133): cuál era, y que el club avisa cuando lo reprograme. */
export function partidoSinHora(
  partido: PartidoParaAvisar,
  antes: HoraDelPartido,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  return {
    asunto: 'Tu partido quedó sin hora',
    cuerpo:
      `Hola ${partido.nombre}:\n\n` +
      `Tu partido, que estaba en ${dondeYCuando(antes)}, quedó sin hora. Te avisamos ` +
      'cuando lo volvamos a programar.\n\n' +
      elPartido(partido) +
      '\n' +
      pie(club, origenWeb),
  };
}

/** El primer partido de un inscrito en un cuadro recién armado (T132). */
export interface PrimerPartido {
  /** "Cuartos de final", "Semifinal"…: ver `nombreDeRonda`. */
  ronda: string;
  /** Nulo si es un bye: no juega esa ronda. */
  rival: string | null;
  /** Dónde y cuándo, si el club ya lo programó. */
  hora: HoraDelPartido | null;
  /** Con un bye, la ronda a la que pasa directo. */
  siguiente?: string;
}

/**
 * "Cuadro armado" (T132, A5): su primer rival —o el bye—, la hora si ya está, y el
 * enlace `?cuadro=<id>` que abre el modal (T135). **Rearmado, lo dice**: el rival que
 * leyó en el primer correo puede haber cambiado.
 */
export function cuadroArmado(
  cuadro: {
    nombre: string;
    torneo: string;
    categoria: string;
    cuadroId: number;
  },
  primero: PrimerPartido,
  rehecho: boolean,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  const deQue = `${cuadro.categoria} de ${cuadro.torneo}`;

  return {
    asunto: `${rehecho ? 'El cuadro cambió' : 'Cuadro armado'}: ${cuadro.torneo}, ${cuadro.categoria}`,
    cuerpo:
      `Hola ${cuadro.nombre}:\n\n` +
      (rehecho
        ? `El club rehízo el cuadro de ${deQue}: revisa tu primer partido, que puede ` +
          'haber cambiado.\n\n'
        : `El club armó el cuadro de ${deQue}.\n\n`) +
      (primero.rival === null
        ? `En ${primero.ronda} no juegas (bye): pasas directo a ${primero.siguiente}.\n`
        : `Tu primer partido: ${primero.ronda}, contra ${primero.rival}.\n`) +
      (primero.hora
        ? `Dónde y cuándo: ${dondeYCuando(primero.hora)}.\n\n`
        : 'Día y hora: te avisamos cuando el club lo programe.\n\n') +
      `El cuadro completo: ${origenWeb}/torneos?cuadro=${cuadro.cuadroId}\n\n` +
      firmaDelClub(club),
  };
}

/**
 * Dónde y cuándo está programado un partido, o nulo si no tiene hora. Lo usan los dos
 * lados del aviso: `programacion` para decir cómo estaba, y el aviso para ver cómo quedó.
 */
export function horaDe(partido: {
  programadoInicio: Date | null;
  programadoFin: Date | null;
  bloqueo: { canchaId: number; cancha: { nombre: string } } | null;
}) {
  return partido.bloqueo && partido.programadoInicio && partido.programadoFin
    ? {
        canchaId: partido.bloqueo.canchaId,
        cancha: partido.bloqueo.cancha.nombre,
        inicio: partido.programadoInicio,
        fin: partido.programadoFin,
      }
    : null;
}

/** Lo que se lee de cada jugador para avisarle. */
const JUGADOR = {
  id: true,
  nombre: true,
  apellido: true,
  socio: { select: { usuario: { select: { email: true } } } },
} as const;

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

  /**
   * Avisa a los dos jugadores de un partido que el club le puso hora, se la cambió o se
   * la quitó (T133). **Decide cuál comparando** lo de antes con lo de ahora: el que llama
   * solo dice cómo estaba.
   *
   * Programar lo que ya estaba igual no manda nada. Cada jugador recibe su propio correo,
   * con el otro de rival, y uno sin correo no impide el aviso al otro.
   *
   * @param antes Dónde y cuándo estaba antes del cambio, o nulo si no tenía hora.
   */
  async cambioDePartido(
    partidoId: number,
    antes: ReturnType<typeof horaDe>,
  ): Promise<void> {
    try {
      const partido = await this.prisma.partido.findUniqueOrThrow({
        where: { id: partidoId },
        select: {
          torneoId: true,
          torneoCategoriaId: true,
          ronda: true,
          programadoInicio: true,
          programadoFin: true,
          bloqueo: {
            select: { canchaId: true, cancha: { select: { nombre: true } } },
          },
          torneo: { select: { nombre: true } },
          torneoCategoria: {
            select: { categoriaJuego: { select: { nombre: true } } },
          },
          jugadorA: { select: JUGADOR },
          jugadorB: { select: JUGADOR },
        },
      });

      const ahora = horaDe(partido);

      const igual =
        antes !== null &&
        ahora !== null &&
        antes.canchaId === ahora.canchaId &&
        antes.inicio.getTime() === ahora.inicio.getTime() &&
        antes.fin.getTime() === ahora.fin.getTime();

      if (igual || (antes === null && ahora === null)) return;
      if (!partido.jugadorA || !partido.jugadorB) return;

      const [rondas, inscripciones, club] = await Promise.all([
        this.prisma.partido.aggregate({
          where: { torneoCategoriaId: partido.torneoCategoriaId },
          _max: { ronda: true },
        }),
        this.prisma.inscripcionTorneo.findMany({
          where: {
            torneoId: partido.torneoId,
            jugadorId: { in: [partido.jugadorA.id, partido.jugadorB.id] },
          },
          orderBy: { inscritaEn: 'desc' },
          select: { jugadorId: true, email: true },
        }),
        this.prisma.configuracionClub.findFirstOrThrow(),
      ]);

      const parejas = [
        [partido.jugadorA, partido.jugadorB],
        [partido.jugadorB, partido.jugadorA],
      ] as const;

      for (const [jugador, rival] of parejas) {
        // El correo de su inscripción en este torneo (la más nueva, si se retiró y
        // volvió) y, si no tiene, el de su cuenta de socio. Sin ninguno, no hay a quién.
        const para =
          inscripciones.find((i) => i.jugadorId === jugador.id)?.email ??
          jugador.socio?.usuario.email ??
          null;
        if (para === null) continue;

        const visto: PartidoParaAvisar = {
          nombre: jugador.nombre,
          rival: `${rival.nombre} ${rival.apellido}`,
          torneo: partido.torneo.nombre,
          categoria: partido.torneoCategoria.categoriaJuego.nombre,
          ronda: nombreDeRonda(
            partido.ronda,
            rondas._max.ronda ?? partido.ronda,
          ),
        };

        const correo =
          antes === null
            ? partidoProgramado(visto, ahora as HoraDelPartido, club, web())
            : ahora === null
              ? partidoSinHora(visto, antes, club, web())
              : partidoCambiado(visto, antes, ahora, club, web());

        await enviarOAnotar(
          this.correo,
          { para, ...correo },
          this.log,
          `No salió el aviso del partido ${partidoId} para ${para}`,
        );
      }
    } catch (falla) {
      this.log.error(
        `No se pudo armar el aviso del partido ${partidoId}: ${String(falla)}`,
      );
    }
  }

  /**
   * "Cuadro armado" a cada inscrito de la categoría (T132, A5), con su primer rival o el
   * bye. Lo llama `armar` con el cuadro ya escrito.
   *
   * Uno por inscrito y de una vez. ponytail: si el hosting tiene un tope de correos por
   * hora y un cuadro lo pasa, esto pasa a la tanda del cron de recordatorios
   * (`CORREO_POR_CORRIDA`); se decide cuando se sepa el tope (Riesgos de la sexta parte).
   *
   * @param rehecho Si ya se había armado antes: el correo dice que el cuadro cambió.
   */
  async cuadroArmado(
    torneoCategoriaId: number,
    rehecho: boolean,
  ): Promise<void> {
    try {
      const [cuadro, partidos, inscritos, club] = await Promise.all([
        this.prisma.torneoCategoria.findUniqueOrThrow({
          where: { id: torneoCategoriaId },
          select: {
            torneo: { select: { nombre: true } },
            categoriaJuego: { select: { nombre: true } },
          },
        }),
        this.prisma.partido.findMany({
          where: { torneoCategoriaId },
          orderBy: [{ ronda: 'asc' }, { posicion: 'asc' }],
          select: {
            ronda: true,
            programadoInicio: true,
            programadoFin: true,
            bloqueo: {
              select: { canchaId: true, cancha: { select: { nombre: true } } },
            },
            jugadorA: { select: { id: true, nombre: true, apellido: true } },
            jugadorB: { select: { id: true, nombre: true, apellido: true } },
          },
        }),
        this.prisma.inscripcionTorneo.findMany({
          where: {
            torneoCategoriaId,
            estado: EstadoInscripcionTorneo.INSCRITA,
          },
          select: { email: true, jugador: { select: JUGADOR } },
        }),
        this.prisma.configuracionClub.findFirstOrThrow(),
      ]);

      const rondas = Math.max(...partidos.map((partido) => partido.ronda));

      for (const { email, jugador } of inscritos) {
        const para = email ?? jugador.socio?.usuario.email ?? null;
        if (para === null) continue;

        // El primero en que aparece: los partidos vienen por ronda.
        const suyo = partidos.find(
          (partido) =>
            partido.jugadorA?.id === jugador.id ||
            partido.jugadorB?.id === jugador.id,
        );
        if (!suyo) continue;

        const rival =
          suyo.jugadorA?.id === jugador.id ? suyo.jugadorB : suyo.jugadorA;

        const correo = cuadroArmado(
          {
            nombre: jugador.nombre,
            torneo: cuadro.torneo.nombre,
            categoria: cuadro.categoriaJuego.nombre,
            cuadroId: torneoCategoriaId,
          },
          {
            ronda: nombreDeRonda(suyo.ronda, rondas),
            rival: rival ? `${rival.nombre} ${rival.apellido}` : null,
            hora: horaDe(suyo),
            siguiente: nombreDeRonda(suyo.ronda + 1, rondas),
          },
          rehecho,
          club,
          web(),
        );

        await enviarOAnotar(
          this.correo,
          { para, ...correo },
          this.log,
          `No salió el cuadro armado ${torneoCategoriaId} para ${para}`,
        );
      }
    } catch (falla) {
      this.log.error(
        `No se pudo armar el aviso del cuadro ${torneoCategoriaId}: ${String(falla)}`,
      );
    }
  }
}
