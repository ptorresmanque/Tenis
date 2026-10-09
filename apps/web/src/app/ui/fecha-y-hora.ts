import { Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MatDateFormats,
  NativeDateAdapter,
} from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';

/**
 * Lo que los selectores de Angular Material necesitan para hablar como el club (T122):
 * fechas `dd-mm-aaaa`, la semana desde el lunes, 24 horas y los textos en español.
 *
 * Se provee en cada campo y no en la aplicación: así Material viaja solo con las rutas
 * que tienen un campo de fecha u hora, no en el arranque de todo el sitio.
 */

/** La forma en que se escribe y se lee una fecha en el campo. */
const FECHA_EN_CAMPO = 'dd-mm-aaaa';

const HORA = { hour: '2-digit', minute: '2-digit', hour12: false } as const;

const FORMATOS: MatDateFormats = {
  parse: { dateInput: FECHA_EN_CAMPO, timeInput: HORA },
  display: {
    dateInput: FECHA_EN_CAMPO,
    monthYearLabel: { year: 'numeric', month: 'short' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' },
    timeInput: HORA,
    timeOptionLabel: HORA,
  },
};

/**
 * El adaptador nativo, con lo que le falta para Chile.
 *
 * **Leer `dd-mm-aaaa`.** El nativo usa `Date.parse`, que no entiende el día primero y
 * convierte `05-12-2037` en el 12 de mayo. **Y no corregir una fecha que no existe**:
 * `new Date(2037, 1, 31)` es el 3 de marzo, y el admin que escribió mal agendaría otro día
 * sin enterarse. Acá una fecha imposible es inválida.
 */
@Injectable()
export class AdaptadorDeFechas extends NativeDateAdapter {
  override getFirstDayOfWeek(): number {
    return 1;
  }

  override parse(valor: unknown, formato: object): Date | null {
    if (typeof valor !== 'string') return super.parse(valor, formato);

    const texto = valor.trim();
    if (texto === '') return null;

    const anioPrimero = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto);
    const diaPrimero = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(texto);
    const partes = anioPrimero
      ? [anioPrimero[1], anioPrimero[2], anioPrimero[3]]
      : diaPrimero
        ? [diaPrimero[3], diaPrimero[2], diaPrimero[1]]
        : null;

    if (!partes) return this.invalid();

    const [anio, mes, dia] = partes.map(Number);
    const fecha = new Date(anio, mes - 1, dia);

    return fecha.getFullYear() === anio &&
      fecha.getMonth() === mes - 1 &&
      fecha.getDate() === dia
      ? fecha
      : this.invalid();
  }

  override format(fecha: Date, formato: object | string): string {
    if (formato === FECHA_EN_CAMPO) {
      const dos = (n: number) => String(n).padStart(2, '0');
      return `${dos(fecha.getDate())}-${dos(fecha.getMonth() + 1)}-${fecha.getFullYear()}`;
    }

    return super.format(fecha, formato as object);
  }
}

/** Los textos del calendario, que Material trae en inglés. */
@Injectable()
export class TextosDelCalendario extends MatDatepickerIntl {
  override calendarLabel = 'Calendario';
  override openCalendarLabel = 'Abrir el calendario';
  override closeCalendarLabel = 'Cerrar el calendario';
  override prevMonthLabel = 'Mes anterior';
  override nextMonthLabel = 'Mes siguiente';
  override prevYearLabel = 'Año anterior';
  override nextYearLabel = 'Año siguiente';
  override prevMultiYearLabel = 'Años anteriores';
  override nextMultiYearLabel = 'Años siguientes';
  override switchToMonthViewLabel = 'Elegir el día';
  override switchToMultiYearViewLabel = 'Elegir el mes y el año';
  override startDateLabel = 'Desde';
  override endDateLabel = 'Hasta';
  override comparisonDateLabel = 'Comparación';
}

/** Lo que cada campo de fecha u hora provee para sí. */
export function proveerFechaYHora(): Provider[] {
  return [
    { provide: MAT_DATE_LOCALE, useValue: 'es-CL' },
    { provide: MAT_DATE_FORMATS, useValue: FORMATOS },
    { provide: DateAdapter, useClass: AdaptadorDeFechas },
    { provide: MatDatepickerIntl, useClass: TextosDelCalendario },
  ];
}

/** `AAAA-MM-DD` a un `Date` de ese día, en la hora local; nulo si viene vacío. */
export function textoAFecha(texto: string | null | undefined): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto ?? '');
  return partes ? new Date(+partes[1], +partes[2] - 1, +partes[3]) : null;
}

/** El día de un `Date`, como lo usan los formularios: `AAAA-MM-DD`. */
export function fechaATexto(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** `HH:mm` a un `Date` de hoy a esa hora; nulo si viene vacío. */
export function textoAHora(texto: string | null | undefined): Date | null {
  const partes = /^(\d{2}):(\d{2})$/.exec(texto ?? '');
  if (!partes) return null;

  const hora = new Date();
  hora.setHours(+partes[1], +partes[2], 0, 0);
  return hora;
}

/** La hora de un `Date`, como la usan los formularios: `HH:mm`. */
export function horaATexto(hora: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(hora.getHours())}:${dos(hora.getMinutes())}`;
}
