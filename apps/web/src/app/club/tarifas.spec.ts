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
  async function montar() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Tarifas);
    fixture.detectChanges();

    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/tarifas').flush([
      { canchaId: null, cancha: null, diaSemana: null, horaDesde: '08:00', horaHasta: '18:00', esPico: false, montoClp: 12_000 },
      { canchaId: null, cancha: null, diaSemana: null, horaDesde: '18:00', horaHasta: '22:00', esPico: true, montoClp: 20_000 },
    ]);
    http.expectOne('/api/horarios').flush({
      general: [{ diaSemana: 6, horaApertura: '09:00', horaCierre: '20:00' }],
      porCancha: [],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
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

  it('la franja pico se marca como tal', async () => {
    const texto = await montar();

    expect(texto).toMatch(/hora pico/i);
    expect(texto).toContain('$20.000');
  });
});
