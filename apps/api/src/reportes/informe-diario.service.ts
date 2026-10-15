import { Injectable, Logger } from '@nestjs/common';

import { firmaDelClub } from '../comun/club';
import {
  comoFechaCivil,
  fechaDelClub,
  hoyEnElClub,
  instanteEnElClub,
  ZONA_DEL_CLUB,
} from '../comun/tiempo';
import { web } from '../comun/urls';
import { EnviadorCorreo, enviarOAnotar } from '../identidad/correo';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { FilaDelInforme, InformeDelDia } from './informe-del-dia.service';

const DIA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** La hora del reloj del club, de 0 a 23. */
const HORA = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_DEL_CLUB,
  hour: 'numeric',
  hourCycle: 'h23',
});

/** "1 reserva", "3 clases": el número con su palabra. */
const cuantas = (n: number, una: string, varias: string) =>
  `${n} ${n === 1 ? una : varias}`;

/**
 * El correo del informe diario (T275), en texto plano, como los demás correos del club: una
 * línea por hora con lo que el mesón necesita para llamar, y debajo con quién juega y las
 * notas del mesón. Un día sin nada sale igual, y lo dice: así se sabe que el envío funciona.
 *
 * @param fecha Fecha civil del club, "AAAA-MM-DD".
 */
export function informeEnTexto(
  fecha: string,
  filas: FilaDelInforme[],
  destinatario: { nombre: string },
  origenWeb: string,
  firma: string,
): { asunto: string; cuerpo: string } {
  const dia = DIA.format(instanteEnElClub(fecha, '12:00'));
  const reservas = filas.filter((fila) => fila.tipo === 'Reserva').length;
  const clases = filas.length - reservas;

  const lineas = filas.flatMap((fila) => {
    const quien =
      fila.socioOVisitante === null
        ? fila.quien
        : `${fila.quien} (${fila.socioOVisitante.toLowerCase()})`;
    const principal = [
      `${fila.inicio}–${fila.fin}`,
      fila.lugar,
      // La reserva ya se entiende por quién la tomó; la clase dice cuál es.
      fila.tipo === 'Reserva' ? null : fila.tipo,
      quien,
      fila.telefono,
      fila.folio && `Folio ${fila.folio}`,
      fila.estado,
    ]
      .filter(Boolean)
      .join(' · ');

    return [
      principal,
      ...(fila.acompanantes ? [`   Con ${fila.acompanantes}`] : []),
      ...(fila.observaciones
        ? [`   Observaciones: ${fila.observaciones}`]
        : []),
    ];
  });

  return {
    asunto: `Agenda del día: ${dia}`,
    cuerpo:
      `Hola ${destinatario.nombre}:\n\n` +
      (filas.length === 0
        ? 'Hoy no hay reservas ni clases.\n\n'
        : `Las reservas y clases de hoy, ${dia}:\n\n` +
          `${lineas.join('\n')}\n\n` +
          `${cuantas(reservas, 'reserva', 'reservas')} y ${cuantas(clases, 'clase', 'clases')}.\n\n`) +
      'Para verlas en el panel, o anotar algo:\n' +
      `${origenWeb}/administracion/reservas\n\n` +
      firma,
  };
}

/** Cómo terminó una corrida, para el log del cron. */
export type ResultadoDeLaTanda =
  | { estado: 'apagado' | 'antes-de-la-hora' | 'ya-salio' }
  | { estado: 'enviado'; destinatarios: number };

/**
 * La tanda del informe diario (T275, SPEC-revision-qa.md A9): la dispara el cron de cPanel
 * cada hora, y manda el de hoy a cada administrador y cada gestor una sola vez, al llegar a
 * la hora que diga Configuración (T274).
 *
 * **Registra el día antes de mandar**, como los recordatorios de cuota: dos corridas la misma
 * hora no lo repiten, y si el proceso muere a mitad, tampoco. Un correo que no sale queda en
 * el log y no detiene a los demás.
 */
@Injectable()
export class InformeDiario {
  private readonly log = new Logger('InformeDiario');

  constructor(
    private readonly prisma: PrismaService,
    private readonly informe: InformeDelDia,
    private readonly correo: EnviadorCorreo,
  ) {}

  async correrTanda(ahora = new Date()): Promise<ResultadoDeLaTanda> {
    const club = await this.prisma.configuracionClub.findFirstOrThrow();
    if (!club.informeDiarioActivo) return { estado: 'apagado' };
    if (Number(HORA.format(ahora)) < club.informeDiarioHora)
      return { estado: 'antes-de-la-hora' };

    const fecha = comoFechaCivil(hoyEnElClub(ahora));
    try {
      await this.prisma.informeDiarioEnviado.create({
        data: { fecha: fechaDelClub(fecha) },
      });
    } catch (error) {
      if (esViolacionDeUnicidad(error)) return { estado: 'ya-salio' };
      throw error;
    }

    const [filas, destinatarios] = await Promise.all([
      this.informe.delDia(fecha),
      this.prisma.usuario.findMany({
        where: { OR: [{ esAdmin: true }, { esGestor: true }] },
        select: { email: true, nombre: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    const firma = firmaDelClub(club);

    for (const destinatario of destinatarios) {
      await enviarOAnotar(
        this.correo,
        {
          para: destinatario.email,
          ...informeEnTexto(fecha, filas, destinatario, web(), firma),
        },
        this.log,
      );
    }

    return { estado: 'enviado', destinatarios: destinatarios.length };
  }
}
