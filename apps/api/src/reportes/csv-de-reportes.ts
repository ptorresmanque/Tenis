import { aCsv, Celda } from './csv';
import { ReporteDeIngreso } from './ingreso.service';
import { ReporteDeNoUso } from './no-uso.service';
import { ReporteDeOcupacion } from './ocupacion.service';
import { ReporteDePadron } from './padron.service';

/**
 * Los cuatro reportes, en CSV.
 *
 * **Se arman desde el mismo objeto que devuelve el JSON**, y ésa es toda la gracia: el
 * CSV no vuelve a consultar ni a calcular nada. Con dos caminos separados, el día que
 * uno cambie el club se lleva a su planilla números distintos de los que vio en
 * pantalla, y no hay forma de que lo note.
 */

export function ingresoACsv(reporte: ReporteDeIngreso): string {
  return aCsv(
    [nombreDelCorte(reporte.corte), 'Ingreso CLP'],
    [
      ...reporte.filas.map((fila): Celda[] => [fila.etiqueta, fila.montoClp]),
      ['Total', reporte.totalClp],
      ['Cuotas del período sin cobrar', reporte.cuotasImpagasClp],
    ],
  );
}

export function ocupacionACsv(reporte: ReporteDeOcupacion): string {
  return aCsv(
    [
      nombreDelCorte(reporte.corte),
      'Bloques',
      'Ocupados',
      'Libres',
      'Cerrados',
      'Ocupación %',
    ],
    [
      ...reporte.filas.map((fila): Celda[] => [
        fila.etiqueta,
        fila.bloques,
        fila.ocupados,
        fila.libres,
        fila.cerrados,
        fila.porcentajeOcupacion,
      ]),
      [
        'Total',
        reporte.bloques,
        reporte.ocupados,
        reporte.libres,
        reporte.cerrados,
        reporte.porcentajeOcupacion,
      ],
    ],
  );
}

export function noUsoACsv(reporte: ReporteDeNoUso): string {
  return aCsv(
    [nombreDelCorte(reporte.corte), 'No usadas', 'Reservadas', 'No usadas %'],
    [
      ...reporte.filas.map((fila): Celda[] => [
        fila.etiqueta,
        fila.noUsadas,
        fila.reservadas,
        fila.porcentaje,
      ]),
      ['Total', reporte.noUsadas, reporte.reservadas, reporte.porcentaje],
      ['Reportes sin resolver', reporte.sinResolver, null, null],
    ],
  );
}

export function padronACsv(reporte: ReporteDePadron): string {
  return aCsv(
    ['Período', 'Altas', 'Deuda CLP', 'Socios con deuda'],
    [
      ...reporte.meses.map((mes): Celda[] => [
        mes.periodo,
        mes.altas,
        mes.deudaClp,
        mes.sociosConDeuda,
      ]),
      // El estado del padrón es de hoy y no del cierre del período: va etiquetado así
      // para que nadie lo lea como parte de la serie de arriba.
      ['Activos hoy', reporte.activosHoy, null, null],
      ['Suspendidos hoy', reporte.suspendidosHoy, null, null],
      ['Retirados hoy', reporte.retiradosHoy, null, null],
    ],
  );
}

/** El título de la primera columna: qué corte se pidió. */
function nombreDelCorte(corte: string): string {
  const nombres: Record<string, string> = {
    cancha: 'Cancha',
    condicion: 'Condición',
    franja: 'Franja',
    usuario: 'Tipo de usuario',
    concepto: 'Concepto',
    mes: 'Mes',
  };

  return nombres[corte] ?? 'Corte';
}
