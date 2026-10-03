import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { BloqueDisponible, Cancha, GrillaDeCancha } from './disponibilidad';
import { Marcador } from './marcador';
import { horaEnElClub } from './reloj-del-club';

/**
 * El marcador de la portada: las horas que quedan hoy contra las canchas (TV3.3).
 *
 * Lo que cuidan estos tests es que el tablero no mienta ni se lea solo por color:
 * cada celda dice su estado en palabras, la libre lleva a reservar y la ocupada no
 * se puede tocar. Que con muchas canchas el desplazamiento quede adentro se mide
 * en el navegador, no acá.
 */
describe('Marcador', () => {
  const UNA_HORA = 60 * 60 * 1000;
  const enHoras = (horas: number) => {
    const fecha = new Date(Date.now() + horas * UNA_HORA);
    fecha.setMinutes(0, 0, 0);
    return fecha;
  };

  const cancha = (id: number, techada = false): Cancha =>
    ({
      id,
      nombre: `Cancha ${id}`,
      superficie: 'CEMENTO',
      techada,
      iluminacion: true,
    }) as Cancha;

  const bloque = (canchaId: number, inicio: Date, cambios: Partial<BloqueDisponible> = {}) => ({
    inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + UNA_HORA).toISOString(),
    canchaId,
    montoClp: 12_000,
    esPico: false,
    bloqueado: false,
    motivoBloqueo: null,
    reservado: false,
    ...cambios,
  });

  @Component({
    imports: [Marcador],
    template: `<app-marcador [grillas]="grillas()" />`,
  })
  class Host {
    readonly grillas = signal<GrillaDeCancha[]>([]);
  }

  function montar(grillas: GrillaDeCancha[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.grillas.set(grillas);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  /** La celda de una cancha (1, 2, …) en una fila (0, 1, …), sin contar la hora. */
  const celda = (el: HTMLElement, fila: number, columna: number) =>
    el.querySelectorAll('tbody tr')[fila].querySelectorAll('td')[columna - 1] as HTMLElement;

  it('una columna por cancha, en el orden del catálogo', () => {
    const dosHoras = enHoras(2);
    const el = montar([
      { cancha: cancha(3), bloques: [bloque(3, dosHoras)] },
      { cancha: cancha(1), bloques: [bloque(1, dosHoras)] },
      { cancha: cancha(2), bloques: [bloque(2, dosHoras)] },
    ]);

    const columnas = [...el.querySelectorAll('thead th[scope="col"]')].map((th) =>
      th.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(columnas.slice(1)).toEqual(['Cancha 3', 'Cancha 1', 'Cancha 2']);
  });

  it('las filas son las horas que quedan hoy: la que ya empezó no está', () => {
    const yaEmpezo = enHoras(-1);
    const enDos = enHoras(2);
    const enTres = enHoras(3);
    const el = montar([
      {
        cancha: cancha(1),
        bloques: [bloque(1, yaEmpezo), bloque(1, enTres), bloque(1, enDos)],
      },
    ]);

    const horas = [...el.querySelectorAll('tbody th[scope="row"]')].map((th) => th.textContent);
    expect(horas.length).toBe(2);
    expect(horas[0]).toContain(horaEnElClub(enDos.toISOString()));
    expect(horas[1]).toContain(horaEnElClub(enTres.toISOString()));
  });

  it('la celda libre lleva a la disponibilidad y dice qué cancha y a qué hora', () => {
    const enDos = enHoras(2);
    const el = montar([{ cancha: cancha(1), bloques: [bloque(1, enDos)] }]);
    const enlace = celda(el, 0, 1).querySelector('a');

    // El nombre entero va en aria-label y empieza con lo que se ve (WCAG 2.5.3).
    // Con un sr-only, Chrome ponía un espacio antes de los dos puntos.
    expect(enlace?.getAttribute('href')).toBe('/disponibilidad');
    expect(enlace?.textContent?.trim()).toBe('Libre');
    expect(enlace?.getAttribute('aria-label')).toBe(
      `Libre: reservar la Cancha 1 a las ${horaEnElClub(enDos.toISOString())}`,
    );
  });

  it('las celdas libres no suman paradas de teclado', () => {
    // Con 8 canchas y 6 horas serían 48 Tab hacia la misma página, que ya tiene
    // camino en "Ver todos los horarios" y en el zócalo. El lector igual las activa.
    const el = montar([
      { cancha: cancha(1), bloques: [bloque(1, enHoras(2)), bloque(1, enHoras(3))] },
      { cancha: cancha(2), bloques: [bloque(2, enHoras(2))] },
    ]);
    const enlaces = [...el.querySelectorAll('td a')];

    expect(enlaces.length).toBe(3);
    expect(enlaces.every((enlace) => enlace.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('la ocupada no se puede tocar y dice su estado en palabras', () => {
    const el = montar([
      { cancha: cancha(1), bloques: [bloque(1, enHoras(2), { reservado: true })] },
    ]);

    expect(celda(el, 0, 1).querySelector('a, button')).toBeNull();
    expect(celda(el, 0, 1).textContent).toContain('Ocupada');
  });

  it('la bloqueada dice su motivo en palabras, nunca el código de la base', () => {
    const el = montar([
      {
        cancha: cancha(1),
        bloques: [bloque(1, enHoras(2), { bloqueado: true, motivoBloqueo: 'MANTENCION' })],
      },
    ]);

    expect(celda(el, 0, 1).querySelector('a, button')).toBeNull();
    expect(celda(el, 0, 1).textContent).toContain('En mantención');
    expect(celda(el, 0, 1).textContent).not.toContain('MANTENCION');
  });

  it('una cancha sin bloque a esa hora está cerrada', () => {
    const enDos = enHoras(2);
    const el = montar([
      { cancha: cancha(1), bloques: [bloque(1, enDos)] },
      { cancha: cancha(2), bloques: [] },
    ]);

    expect(celda(el, 0, 2).querySelector('a, button')).toBeNull();
    expect(celda(el, 0, 2).textContent).toContain('Cerrada');
  });

  it('la hora pico lleva su rótulo', () => {
    const el = montar([
      {
        cancha: cancha(1),
        bloques: [bloque(1, enHoras(2)), bloque(1, enHoras(3), { esPico: true })],
      },
    ]);
    const filas = el.querySelectorAll('tbody th[scope="row"]');

    expect(filas[0].textContent).not.toContain('Pico');
    expect(filas[1].textContent).toContain('Pico');
  });

  it('la cancha techada lo dice, también al lector de pantalla', () => {
    const el = montar([{ cancha: cancha(5, true), bloques: [bloque(5, enHoras(2))] }]);
    const encabezado = el.querySelectorAll('thead th[scope="col"]')[1];

    expect(encabezado.textContent).toContain('techada');
  });
});
