import { Injectable } from '@nestjs/common';

import { comoFechaCivil, fechaDelClub, mesEnElClub } from '../comun/tiempo';
import { EstadoCuota, EstadoSocio } from '../generated/prisma/client';
import type { CampoAuditado } from '../identidad/socios/cambios.service';
import { PrismaService } from '../prisma/prisma.service';
import { abreEl, cierraEl } from './rango';

/**
 * El campo de `CambioSocio` del que salen las bajas.
 *
 * `satisfies` y no una cadena suelta: el día que la auditoría deje de vigilar el
 * estado, esto no compila en vez de informar cero bajas para siempre.
 */
const CAMPO_ESTADO = 'estado' satisfies CampoAuditado;

/** Un mes de la serie. */
export interface MesDelPadron {
  /** "AAAA-MM". */
  periodo: string;
  /** Socios que ingresaron ese mes. */
  altas: number;
  /** Socios que pasaron a retirados ese mes. */
  bajas: number;
  /** Cuánto se emitió ese período y sigue sin cobrarse. */
  deudaClp: number;
  /** A cuántos socios corresponde esa deuda. */
  sociosConDeuda: number;
}

export interface ReporteDePadron {
  desde: string;
  hasta: string;
  /** Socios con ficha activa **hoy**, no al cierre del período. Ver la nota de abajo. */
  activosHoy: number;
  suspendidosHoy: number;
  retiradosHoy: number;
  altasDelPeriodo: number;
  /** La suma de las bajas de los meses de abajo, para que la columna cuadre. */
  bajasDelPeriodo: number;
  meses: MesDelPadron[];
  calculadoEn: string;
}

/**
 * El padrón y la morosidad en el tiempo.
 *
 * `cuotas` ya calcula la morosidad de hoy; lo que agrega este reporte es **la serie**:
 * si la deuda sube o baja mes a mes. La deuda de un mes se lee de las cuotas de ese
 * período que siguen pendientes, así que es una foto que cambia cuando alguien se pone
 * al día —igual que el reporte de ingreso, y por la misma razón—.
 *
 * **Las bajas salen de la auditoría de fichas (T37), no de una columna en `Socio`.**
 * `Socio` guarda el estado de hoy y no la fecha en que cambió, pero `CambioSocio` lleva
 * cada cambio de estado con su instante, y `FichaDeSocioService` —el único camino que
 * escribe ese campo— lo registra dentro de la misma transacción. Una columna
 * `fechaBaja` sería además *peor*: se sobrescribe al reincorporar a alguien, y la baja
 * de marzo desaparecería de la serie el día que ese socio vuelve. Lo que ya ocurrió no
 * se sobrescribe.
 *
 * El límite honesto es que **una baja es una decisión registrada**: un socio que quedó
 * retirado antes de T37, o al que le cambiaron el estado por SQL, no dejó renglón y no
 * aparece acá. Está en `retiradosHoy`, que cuenta el estado y no el hecho.
 *
 * Por lo mismo, **los conteos por estado son de hoy y no del cierre del período**, y el
 * nombre de los campos lo dice para que nadie los lea como una serie histórica.
 */
@Injectable()
export class PadronDelClub {
  constructor(private readonly prisma: PrismaService) {}

  async reporte(desde: string, hasta: string): Promise<ReporteDePadron> {
    const periodos = this.periodosEntre(desde, hasta);
    const inicio = fechaDelClub(desde);
    const fin = fechaDelClub(hasta);

    const [porEstado, altas, bajas, cuotas] = await Promise.all([
      this.prisma.socio.groupBy({ by: ['estado'], _count: true }),
      this.prisma.socio.findMany({
        where: { fechaIngreso: { gte: inicio, lte: fin } },
        select: { fechaIngreso: true },
      }),
      this.prisma.cambioSocio.findMany({
        where: {
          campo: CAMPO_ESTADO,
          valorNuevo: EstadoSocio.RETIRADO,
          hechoEn: { gte: abreEl(desde), lt: cierraEl(hasta) },
        },
        select: { socioId: true, hechoEn: true },
      }),
      this.prisma.cuota.findMany({
        where: {
          estado: EstadoCuota.PENDIENTE,
          periodo: { in: periodos },
        },
        select: {
          periodo: true,
          socioId: true,
          montoClp: true,
          descuentoClp: true,
        },
      }),
    ]);

    const cuenta = (cual: EstadoSocio) =>
      porEstado.find((fila) => fila.estado === cual)?._count ?? 0;

    const meses = periodos.map((periodo): MesDelPadron => {
      const suyas = cuotas.filter((cuota) => cuota.periodo === periodo);

      return {
        periodo,
        altas: altas.filter(
          (socio) => comoFechaCivil(socio.fechaIngreso).slice(0, 7) === periodo,
        ).length,
        // Socios distintos y no renglones: retirar, reincorporar y volver a retirar
        // son dos decisiones, pero **un socio menos**. Esta columna cuenta gente.
        // `hechoEn` es un instante y `fechaIngreso` una columna `DATE`: por eso la
        // baja pasa por el reloj del club y el alta de arriba no. Aplicarle
        // `mesEnElClub` a una fecha civil la correría un día hacia atrás.
        bajas: new Set(
          bajas
            .filter((baja) => mesEnElClub(baja.hechoEn) === periodo)
            .map((baja) => baja.socioId),
        ).size,
        deudaClp: suyas.reduce(
          (suma, cuota) => suma + cuota.montoClp - cuota.descuentoClp,
          0,
        ),
        // Socios distintos y no cuotas: quien debe tres meses es un socio con
        // deuda, no tres. Es el número que el club usa para saber a cuántos llamar.
        sociosConDeuda: new Set(suyas.map((cuota) => cuota.socioId)).size,
      };
    });

    return {
      desde,
      hasta,
      activosHoy: cuenta(EstadoSocio.ACTIVO),
      suspendidosHoy: cuenta(EstadoSocio.SUSPENDIDO),
      retiradosHoy: cuenta(EstadoSocio.RETIRADO),
      altasDelPeriodo: altas.length,
      // Suma de la columna y no un `Set` sobre el rango entero: el club suma la
      // columna a mano y el total tiene que darle lo mismo.
      bajasDelPeriodo: meses.reduce((suma, mes) => suma + mes.bajas, 0),
      meses,
      calculadoEn: new Date().toISOString(),
    };
  }

  /**
   * Los meses que el rango **toca**, no solo aquellos cuyo día 1 cae dentro.
   *
   * Es la regla contraria a la del ingreso, y a propósito. Allá, meter la cuota entera
   * de agosto en un rango del 10 al 20 inflaría la caja de once días con la plata de un
   * mes. Acá la serie es mensual por naturaleza: preguntar por el 10 de agosto y recibir
   * cero meses no protege de nada, solo deja la pantalla vacía.
   */
  private periodosEntre(desde: string, hasta: string): string[] {
    const fin = fechaDelClub(hasta);
    const periodos: string[] = [];

    const mes = fechaDelClub(desde);
    mes.setUTCDate(1);

    while (mes.getTime() <= fin.getTime()) {
      periodos.push(comoFechaCivil(mes).slice(0, 7));
      mes.setUTCMonth(mes.getUTCMonth() + 1);
    }

    return periodos;
  }
}
