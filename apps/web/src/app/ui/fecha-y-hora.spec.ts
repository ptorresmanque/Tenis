import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { beforeEach, describe, expect, it } from 'vitest';

import { proveerCampos } from './campos';
import {
  AdaptadorDeFechas,
  fechaATexto,
  horaATexto,
  proveerFechaYHora,
  textoAFecha,
  textoAHora,
} from './fecha-y-hora';

/**
 * T244. Las fechas y las horas viven como `Date` dentro de cada componente, como las entrega
 * Material, y pasan a texto solo al hablar con la API (A5).
 */
describe('fecha y hora como texto', () => {
  it('**el día de un `Date` sale como lo espera la API**: AAAA-MM-DD', () => {
    expect(fechaATexto(new Date(2037, 11, 5))).toBe('2037-12-05');
  });

  it('**la hora sale en 24 horas**, con el cero adelante', () => {
    expect(horaATexto(new Date(2000, 0, 1, 9, 0))).toBe('09:00');
  });

  it('**un campo vacío o inválido sale vacío**, como en los campos de antes', () => {
    // El selector entrega nulo si el campo quedó vacío, y una fecha inválida si se escribió
    // una que no existe: ninguna de las dos es un día que se pueda mandar.
    expect(fechaATexto(null)).toBe('');
    expect(fechaATexto(new Date(Number.NaN))).toBe('');
    expect(horaATexto(null)).toBe('');
    expect(horaATexto(new Date(Number.NaN))).toBe('');
  });

  it('ida y vuelta: el texto de la API vuelve al mismo texto', () => {
    expect(fechaATexto(textoAFecha('2037-04-05'))).toBe('2037-04-05');
    expect(horaATexto(textoAHora('19:30'))).toBe('19:30');
  });
});

/**
 * T122, T244. Los campos de fecha y hora de Material, con lo que `proveerFechaYHora()` les da
 * para hablar como el club: el día primero, 24 horas y los textos en español.
 */
@Component({
  imports: [FormsModule, MatFormFieldModule, MatInput, MatDatepickerModule, MatTimepickerModule],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <mat-form-field>
      <mat-label>Día</mat-label>
      <input matInput id="dia" name="dia" [matDatepicker]="calendario" [(ngModel)]="dia" />
      <mat-datepicker-toggle matIconSuffix [for]="calendario" />
      <mat-datepicker #calendario />
    </mat-form-field>
    <mat-form-field>
      <mat-label>Hora</mat-label>
      <input matInput id="hora" name="hora" [matTimepicker]="reloj" [(ngModel)]="hora" />
      <mat-timepicker #reloj />
    </mat-form-field>
  `,
})
class Anfitrion {
  dia = textoAFecha('2037-08-17');
  hora = textoAHora('14:30');
}

describe('Campos de fecha y hora', () => {
  let fixture: ComponentFixture<Anfitrion>;

  const campo = (id: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`#${id}`)!;

  const escribir = async (id: string, valor: string) => {
    campo(id).value = valor;
    campo(id).dispatchEvent(new Event('input'));
    campo(id).dispatchEvent(new Event('change'));
    campo(id).dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Anfitrion);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  describe('la fecha', () => {
    it('**se muestra como se escribe en Chile: día, mes y año**', () => {
      expect(campo('dia').value).toBe('17-08-2037');
    });

    it('**escribirla así entrega ese día**', async () => {
      await escribir('dia', '05-12-2037');

      expect(fechaATexto(fixture.componentInstance.dia)).toBe('2037-12-05');
    });

    it('también entiende la barra y el año primero', async () => {
      await escribir('dia', '5/12/2037');
      expect(fechaATexto(fixture.componentInstance.dia)).toBe('2037-12-05');

      await escribir('dia', '2037-12-06');
      expect(fechaATexto(fixture.componentInstance.dia)).toBe('2037-12-06');
    });

    it('**una fecha que no existe no se convierte en otra**', async () => {
      // `new Date(2037, 1, 31)` es el 3 de marzo: el admin que escribe mal agendaría
      // otro día sin enterarse.
      await escribir('dia', '31-02-2037');

      expect(fechaATexto(fixture.componentInstance.dia)).toBe('');
    });

    it('el botón del calendario dice qué hace, en español', () => {
      const boton = (fixture.nativeElement as HTMLElement).querySelector(
        'mat-datepicker-toggle button',
      );

      expect(boton?.getAttribute('aria-label')).toBe('Abrir el calendario');
    });
  });

  describe('la hora', () => {
    it('**se muestra en 24 horas**', () => {
      expect(campo('hora').value).toBe('14:30');
    });

    it('**escribirla la entrega como HH:mm**, con el cero adelante', async () => {
      await escribir('hora', '9:00');

      expect(horaATexto(fixture.componentInstance.hora)).toBe('09:00');
    });

    it('el campo es una lista: se abre desde el campo, sin el botón', () => {
      expect(campo('hora').getAttribute('role')).toBe('combobox');
    });
  });
});

describe('AdaptadorDeFechas', () => {
  it('**la semana del club empieza el lunes**', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [AdaptadorDeFechas] });

    expect(TestBed.inject(AdaptadorDeFechas).getFirstDayOfWeek()).toBe(1);
  });
});
