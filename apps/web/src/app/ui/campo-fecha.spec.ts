import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { beforeEach, describe, expect, it } from 'vitest';

import { CampoFecha } from './campo-fecha';
import { CampoHora } from './campo-hora';
import { AdaptadorDeFechas } from './fecha-y-hora';

/**
 * T122. Los campos de fecha y hora del sitio, con el selector de Angular Material
 * (decisión 2 de la sexta parte). Lo que entra y sale es texto —`AAAA-MM-DD` y `HH:mm`,
 * como los formularios de antes—: ningún `Date` del navegador cruza la hora del club.
 */
@Component({
  imports: [FormsModule, CampoFecha, CampoHora],
  template: `
    <label for="dia">Día</label>
    <app-campo-fecha inputId="dia" name="dia" [(ngModel)]="dia" />
    <label for="hora">Hora</label>
    <app-campo-hora inputId="hora" name="hora" [(ngModel)]="hora" />
  `,
})
class Anfitrion {
  dia = '2037-08-17';
  hora = '14:30';
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

    it('**escribirla así la entrega como la usan los formularios**', async () => {
      await escribir('dia', '05-12-2037');

      expect(fixture.componentInstance.dia).toBe('2037-12-05');
    });

    it('también entiende la barra y el año primero', async () => {
      await escribir('dia', '5/12/2037');
      expect(fixture.componentInstance.dia).toBe('2037-12-05');

      await escribir('dia', '2037-12-06');
      expect(fixture.componentInstance.dia).toBe('2037-12-06');
    });

    it('**una fecha que no existe no se convierte en otra**', async () => {
      // `new Date(2037, 1, 31)` es el 3 de marzo: el admin que escribe mal agendaría
      // otro día sin enterarse.
      await escribir('dia', '31-02-2037');

      expect(fixture.componentInstance.dia).toBe('');
    });

    it('la etiqueta nombra al campo y el botón dice qué hace, en español', () => {
      const boton = (fixture.nativeElement as HTMLElement).querySelector(
        'app-campo-fecha button',
      );

      expect(campo('dia').labels?.[0]?.textContent).toBe('Día');
      expect(boton?.getAttribute('aria-label')).toBe('Abrir el calendario');
    });
  });

  describe('la hora', () => {
    it('**se muestra en 24 horas**', () => {
      expect(campo('hora').value).toBe('14:30');
    });

    it('**escribirla la entrega como HH:mm**, con el cero adelante', async () => {
      await escribir('hora', '9:00');

      expect(fixture.componentInstance.hora).toBe('09:00');
    });

    it('el botón dice qué hace, en español', () => {
      const boton = (fixture.nativeElement as HTMLElement).querySelector(
        'app-campo-hora button',
      );

      expect(boton?.getAttribute('aria-label')).toBe('Elegir la hora');
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

