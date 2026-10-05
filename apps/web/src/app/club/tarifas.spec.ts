import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Tarifas } from './tarifas';

/**
 * Las tarifas y el horario del club. Hasta TV4.1 no tenían test; este cuida lo
 * que corrigió D4.1: **el horario sale de la configuración**, no de un texto
 * escrito en la plantilla que contradecía al de verdad.
 */
describe('Tarifas', () => {
  /** El componente montado: las consultas van acá adentro y no a todo `document`. */
  let raiz: HTMLElement;

  async function montar() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Tarifas);
    fixture.detectChanges();

    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/tarifas').flush([
      { canchaId: null, cancha: null, diaSemana: null, horaDesde: '08:00', horaHasta: '18:00', esPico: false, montoClp: 12_000, montoClp90: 16_000 },
      { canchaId: null, cancha: null, diaSemana: null, horaDesde: '18:00', horaHasta: '22:00', esPico: true, montoClp: 20_000, montoClp90: null },
    ]);
    http.expectOne('/api/horarios').flush({
      general: [{ diaSemana: 6, horaApertura: '09:00', horaCierre: '20:00' }],
      porCancha: [],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    raiz = fixture.nativeElement as HTMLElement;
    return raiz.textContent?.replace(/\s+/g, ' ') ?? '';
  }

  /** Sin lo que es solo para lectores de pantalla: lo que se ve. */
  function aLaVista(nodo: Element): string {
    const copia = nodo.cloneNode(true) as HTMLElement;
    copia.querySelectorAll('.sr-only').forEach((oculto) => oculto.remove());
    return copia.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  /** Lo que se ve en cada fila de la tabla, celda por celda, sin lo que es solo para lectores. */
  function celdasVisibles(): string[][] {
    return Array.from(raiz.querySelectorAll('tbody tr')).map((fila) =>
      Array.from(fila.querySelectorAll('td')).map((celda) => {
        const copia = celda.cloneNode(true) as HTMLElement;
        copia.querySelectorAll('.sr-only').forEach((nodo) => nodo.remove());
        return copia.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      }),
    );
  }

  it('el horario de apertura sale de la configuración del club', async () => {
    const texto = await montar();

    expect(texto).toContain('Sábado');
    expect(texto).toContain('09:00 a 20:00');
  });

  it('una tarifa sin cancha ni día rige para todas, todos los días', async () => {
    const texto = await montar();

    expect(texto).toContain('Todas');
    expect(texto).toContain('Todos');
    expect(texto).toContain('$12.000');
  });

  it('publica el precio de 1 hora y el de 1 hora y media (T81)', async () => {
    const texto = await montar();

    expect(texto).toContain('1 hora y media');
    expect(celdasVisibles()[0].slice(1, 3)).toEqual(['$12.000', '$16.000']);
  });

  it('**en la tabla los precios van justo después del horario**, antes que cancha y días', async () => {
    // Es lo que alguien viene a buscar: en una tabla que se desplaza hacia el lado, lo
    // que queda a la derecha es lo que no se ve.
    await montar();

    const cabeceras = Array.from(raiz.querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(cabeceras).toEqual(['Horario', '1 hora', '1 hora y media', 'Cancha', 'Días']);
  });

  it('**en el teléfono cada franja es una tarjeta** con su horario y sus dos precios', async () => {
    await montar();

    const tarjetas = Array.from(raiz.querySelectorAll('[data-tarifa-tarjeta]')).map(aLaVista);

    expect(tarjetas).toHaveLength(2);
    expect(tarjetas[0]).toContain('08:00–18:00');
    expect(tarjetas[0]).toContain('1 hora $12.000');
    expect(tarjetas[0]).toContain('1 hora y media $16.000');
    expect(tarjetas[0]).toContain('Todas las canchas, todos los días');
  });

  it('la tarjeta de una franja de una cancha y un día lo dice en plural', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Tarifas);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/tarifas').flush([
      { canchaId: 3, cancha: 'Cancha 3', diaSemana: 6, horaDesde: '09:00', horaHasta: '13:00', esPico: false, montoClp: 15_000, montoClp90: null },
      { canchaId: 3, cancha: 'Cancha 3', diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00', esPico: false, montoClp: 14_000, montoClp90: null },
    ]);
    http.expectOne('/api/horarios').flush({ general: [], porCancha: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const tarjetas = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-tarifa-tarjeta]'),
    ).map(aLaVista);

    expect(tarjetas[0]).toContain('Cancha 3, los sábados');
    expect(tarjetas[1]).toContain('Cancha 3, los lunes');
  });

  it('la tarjeta de una franja sin hora y media muestra solo el precio de 1 hora', async () => {
    await montar();

    const tarjeta = raiz.querySelectorAll('[data-tarifa-tarjeta]')[1];

    expect(aLaVista(tarjeta)).toContain('1 hora $20.000');
    expect(aLaVista(tarjeta)).not.toContain('1 hora y media');
    expect(tarjeta.textContent).toContain('No se arrienda por hora y media');
  });

  it('**una franja sin hora y media muestra solo el precio de 1 hora: ni guion ni cero** (T81)', async () => {
    // Un guion o un cero invitarían a pedir algo que no se vende. Para quien usa lector
    // de pantalla la celda no queda muda: "en blanco" no le explica nada.
    const texto = await montar();

    expect(celdasVisibles()[1].slice(1, 3)).toEqual(['$20.000', '']);
    expect(texto).toContain('No se arrienda por hora y media');
    expect(texto).not.toContain('$0');
  });

  it('la franja pico se marca como tal', async () => {
    const texto = await montar();

    expect(texto).toMatch(/hora pico/i);
    expect(texto).toContain('$20.000');
  });
});
