import { Injectable } from '@nestjs/common';

import { comoFechaCivil, fechaDelClub } from '../comun/tiempo';
import { EstadoCuota, EstadoSocio } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Un mes de la serie. */
export interface MesDelPadron {
  /** "AAAA-MM". */
  periodo: string;
  /** Socios que ingresaron ese mes. */
  altas: number;
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
 * **Las bajas del período no se informan, y no es un olvido.** `Socio` guarda `estado`
 * pero no la fecha en que dejó de ser socio: con lo que hay en la base se puede decir
 * cuántos están retirados hoy, no cuántos se retiraron en marzo. Inventar la cifra a
 * partir de otra columna daría un número que parece un dato y no lo es. Para tenerla
 * hace falta una columna nueva en `identidad`, y este módulo no escribe en ningún lado.
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

    const [porEstado, altas, cuotas] = await Promise.all([
      this.prisma.socio.groupBy({ by: ['estado'], _count: true }),
      this.prisma.socio.findMany({
        where: { fechaIngreso: { gte: inicio, lte: fin } },
        select: { fechaIngreso: true },
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

    return {
      desde,
      hasta,
      activosHoy: cuenta(EstadoSocio.ACTIVO),
      suspendidosHoy: cuenta(EstadoSocio.SUSPENDIDO),
      retiradosHoy: cuenta(EstadoSocio.RETIRADO),
      altasDelPeriodo: altas.length,
      meses: periodos.map((periodo) => {
        const suyas = cuotas.filter((cuota) => cuota.periodo === periodo);

        return {
          periodo,
          altas: altas.filter(
            (socio) =>
              comoFechaCivil(socio.fechaIngreso).slice(0, 7) === periodo,
          ).length,
          deudaClp: suyas.reduce(
            (suma, cuota) => suma + cuota.montoClp - cuota.descuentoClp,
            0,
          ),
          // Socios distintos y no cuotas: quien debe tres meses es un socio con
          // deuda, no tres. Es el número que el club usa para saber a cuántos llamar.
          sociosConDeuda: new Set(suyas.map((cuota) => cuota.socioId)).size,
        };
      }),
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
