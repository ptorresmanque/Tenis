import { Injectable, Logger } from '@nestjs/common';

import { hoyEnElClub } from '../comun/tiempo';
import { web } from '../comun/urls';
import {
  EstadoCuota,
  EstadoSocio,
  TipoCuota,
  TipoRecordatorio,
} from '../generated/prisma/client';
import { EnviadorCorreo, enviarOAnotar } from '../identidad/correo';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { firmaDelClub } from '../reservas/correos';
import { EmisionDeCuotas } from './emision.service';
import { ultimoDiaDelPeriodo } from './periodos';

/** El previo empieza 5 días antes del último del mes (decisión 5 de la quinta parte). */
const DIAS_ANTES_DEL_FIN = 5;

/**
 * Cuántos correos manda cada corrida, como máximo, si `CORREO_POR_CORRIDA` no lo dice.
 *
 * El hosting limita los correos por hora, y el cron corre cada hora: con el tope, una lista
 * larga se reparte en varias corridas en vez de chocar con el límite a mitad de camino.
 */
const TOPE_POR_OMISION = 50;

const MES = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  month: 'long',
});

/** "noviembre", de "2037-11". */
function nombreDelMes(periodo: string): string {
  return MES.format(new Date(`${periodo}-01T12:00:00.000Z`));
}

/** "2037-12" → "2038-01". `Date.UTC` con el mes 12 rueda solo al año siguiente. */
function periodoSiguiente(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);

  return new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 7);
}

/**
 * Qué recordatorios tocan hoy (T111). El vencido, todo el mes en curso: sale una vez, el
 * primer día que la corrida lo encuentre, y así un cron que no corrió el 1 no lo pierde. El
 * previo del mes que viene, desde 5 días antes de fin de mes: el 26 en uno de 31 días, el 23
 * en un febrero de 28.
 *
 * @param hoy Fecha civil del club, a medianoche UTC.
 */
export function recordatoriosDeHoy(
  hoy: Date,
): { tipo: TipoRecordatorio; periodo: string }[] {
  const periodo = hoy.toISOString().slice(0, 7);
  const ultimo = ultimoDiaDelPeriodo(periodo).getUTCDate();
  const tocan: { tipo: TipoRecordatorio; periodo: string }[] = [
    { tipo: TipoRecordatorio.VENCIDA, periodo },
  ];

  if (hoy.getUTCDate() >= ultimo - DIAS_ANTES_DEL_FIN) {
    tocan.push({
      tipo: TipoRecordatorio.PREVIO,
      periodo: periodoSiguiente(periodo),
    });
  }

  return tocan;
}

/** El aviso de la cuota que viene. Todavía no está emitida: se emite el día 1. */
export function recordatorioPrevio(
  socio: { nombre: string },
  periodo: string,
  origenWeb: string,
  firma: string,
): { asunto: string; cuerpo: string } {
  const mes = nombreDelMes(periodo);

  return {
    asunto: `Tu cuota de ${mes}`,
    cuerpo:
      `Hola ${socio.nombre}:\n\n` +
      `El 1 de ${mes} se emite tu cuota de ${mes}. Desde ese día puedes pagarla en línea ` +
      'en "Mi cuenta", o en el mesón del club:\n' +
      `${origenWeb}/mi-cuenta\n\n` +
      firma,
  };
}

/**
 * El aviso de lo que quedó impago: la mensual, la incorporación o las dos. Las dos
 * condiciones son las mismas que le impiden reservar, y el correo se lo dice.
 */
export function recordatorioVencido(
  socio: { nombre: string },
  pendiente: { mensual: boolean; incorporacion: boolean },
  origenWeb: string,
  firma: string,
): { asunto: string; cuerpo: string } {
  const que = [
    pendiente.mensual ? 'la cuota mensual' : null,
    pendiente.incorporacion ? 'la incorporación' : null,
  ]
    .filter(Boolean)
    .join(' y ');

  return {
    asunto: 'Tienes la cuota pendiente',
    cuerpo:
      `Hola ${socio.nombre}:\n\n` +
      `Tienes pendiente ${que}. Mientras esté pendiente no puedes reservar canchas.\n\n` +
      'Págala en línea en "Mi cuenta", o en el mesón del club:\n' +
      `${origenWeb}/mi-cuenta\n\n` +
      firma,
  };
}

/** Un recordatorio por mandar: a quién, de qué y lo que necesita su correo. */
interface Candidato {
  socioId: number;
  tipo: TipoRecordatorio;
  periodo: string;
  nombre: string;
  email: string;
  pendiente: { mensual: boolean; incorporacion: boolean };
}

/**
 * Los recordatorios de cuota (T111): quién recibe hoy el suyo, y una tanda de envíos.
 *
 * Lo dispara un cron cada hora (T112), no las visitas. Cada corrida manda como máximo
 * `CORREO_POR_CORRIDA` y **registra cada envío antes de mandarlo**: dos corridas el mismo día
 * no repiten ninguno, y si el proceso muere a mitad, el que quedó registrado tampoco.
 */
@Injectable()
export class RecordatoriosDeCuota {
  private readonly log = new Logger('Recordatorios');

  constructor(
    private readonly prisma: PrismaService,
    private readonly emision: EmisionDeCuotas,
    private readonly correo: EnviadorCorreo,
  ) {}

  /**
   * Una tanda: los vencidos primero, que le impiden reservar a alguien, y después los previos.
   *
   * @returns Cuántos tomó esta tanda y cuántos quedan para la siguiente.
   */
  async correrTanda(
    ahora = new Date(),
    tope = topePorCorrida(),
  ): Promise<{ enviados: number; pendientes: number }> {
    const hoy = hoyEnElClub(ahora);
    const tocan = recordatoriosDeHoy(hoy);

    // Primero se emite el mes en curso: el vencido manda a pagar una cuota que tiene que
    // estar en "Mi cuenta" cuando el socio llegue.
    await this.emision.delPeriodo(tocan[0].periodo, ahora);

    const candidatos: Candidato[] = [];
    for (const { tipo, periodo } of tocan) {
      candidatos.push(
        ...(tipo === TipoRecordatorio.VENCIDA
          ? await this.vencidos(hoy, periodo)
          : await this.previos(periodo)),
      );
    }

    const tanda = candidatos.slice(0, tope);
    if (tanda.length === 0) return { enviados: 0, pendientes: 0 };

    const club = await this.prisma.configuracionClub.findFirstOrThrow();
    const firma = firmaDelClub(club);
    let enviados = 0;

    for (const candidato of tanda) {
      // **Antes de mandar.** Si otra corrida ya lo registró, el único lo ataja y se salta.
      try {
        await this.prisma.recordatorioCuota.create({
          data: {
            socioId: candidato.socioId,
            periodo: candidato.periodo,
            tipo: candidato.tipo,
          },
        });
      } catch (error) {
        if (esViolacionDeUnicidad(error)) continue;
        throw error;
      }

      const { asunto, cuerpo } =
        candidato.tipo === TipoRecordatorio.VENCIDA
          ? recordatorioVencido(candidato, candidato.pendiente, web(), firma)
          : recordatorioPrevio(candidato, candidato.periodo, web(), firma);

      await enviarOAnotar(
        this.correo,
        { para: candidato.email, asunto, cuerpo },
        this.log,
        `No salió el recordatorio ${candidato.tipo} de ${candidato.periodo} para el socio ` +
          `${candidato.socioId}`,
      );
      enviados++;
    }

    this.log.log(
      `Tanda de recordatorios: ${enviados} enviados, ${candidatos.length - tanda.length} ` +
        'quedan para la siguiente.',
    );

    return { enviados, pendientes: candidatos.length - tanda.length };
  }

  /**
   * Los que hoy no pueden reservar por la cuota: atrasados en la mensual o con la
   * incorporación impaga. Las mismas dos condiciones que mira `reservas`.
   */
  private async vencidos(hoy: Date, periodo: string): Promise<Candidato[]> {
    const socios = await this.prisma.socio.findMany({
      where: {
        estado: EstadoSocio.ACTIVO,
        OR: [
          { alDiaHasta: { lt: hoy } },
          {
            cuotas: {
              some: {
                tipo: TipoCuota.INCORPORACION,
                estado: EstadoCuota.PENDIENTE,
              },
            },
          },
        ],
        recordatorios: { none: { periodo, tipo: TipoRecordatorio.VENCIDA } },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        alDiaHasta: true,
        usuario: { select: { nombre: true, email: true } },
        cuotas: {
          where: {
            tipo: TipoCuota.INCORPORACION,
            estado: EstadoCuota.PENDIENTE,
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    return socios.map((socio) => ({
      socioId: socio.id,
      tipo: TipoRecordatorio.VENCIDA,
      periodo,
      nombre: socio.usuario.nombre,
      email: socio.usuario.email,
      pendiente: {
        mensual: socio.alDiaHasta < hoy,
        incorporacion: socio.cuotas.length > 0,
      },
    }));
  }

  /** Los que no tienen pagado el mes que viene. Casi todos: nadie paga por adelantado. */
  private async previos(periodo: string): Promise<Candidato[]> {
    const socios = await this.prisma.socio.findMany({
      where: {
        estado: EstadoSocio.ACTIVO,
        alDiaHasta: { lt: ultimoDiaDelPeriodo(periodo) },
        recordatorios: { none: { periodo, tipo: TipoRecordatorio.PREVIO } },
      },
      orderBy: { id: 'asc' },
      select: { id: true, usuario: { select: { nombre: true, email: true } } },
    });

    return socios.map((socio) => ({
      socioId: socio.id,
      tipo: TipoRecordatorio.PREVIO,
      periodo,
      nombre: socio.usuario.nombre,
      email: socio.usuario.email,
      pendiente: { mensual: true, incorporacion: false },
    }));
  }
}

/** El tope de la variable de entorno, o 50 si no está o no es un número positivo. */
function topePorCorrida(): number {
  const tope = Number(process.env.CORREO_POR_CORRIDA);

  return Number.isInteger(tope) && tope > 0 ? tope : TOPE_POR_OMISION;
}
