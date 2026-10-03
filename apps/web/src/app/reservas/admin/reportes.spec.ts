import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HoraReportada, Reportes } from './reportes.service';
import { ReportesPanel } from './reportes';

/**
 * T35. La bandeja donde el club decide.
 *
 * Lo que esta pantalla no puede hacer es tan importante como lo que hace: no dice
 * quién reportó —el servidor tampoco se lo manda— y no sanciona sola.
 */
describe('ReportesPanel', () => {
  const UNA: HoraReportada = {
    reservaId: 25,
    folio: 'AB23CDE',
    cancha: 'Cancha 1',
    // 12:00Z en agosto son las 08:00 en Santiago.
    inicio: '2026-08-21T12:00:00.000Z',
    fin: '2026-08-21T13:00:00.000Z',
    reportes: 2,
    ultimoReporteEn: '2026-08-21T15:00:00.000Z',
    socio: {
      id: 1,
      numeroSocio: '001',
      nombre: 'Carolina Díaz',
      sancionadoHasta: null,
    },
  };

  let fixture: ComponentFixture<ReportesPanel>;
  let api: {
    pendientes: ReturnType<typeof vi.fn>;
    resolver: ReturnType<typeof vi.fn>;
  };

  const montar = async (horas: HoraReportada[] = [UNA]) => {
    api = {
      pendientes: vi.fn().mockResolvedValue(horas),
      resolver: vi.fn().mockResolvedValue({ sancionadoHasta: '2026-09-05' }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Reportes, useValue: api }],
    });

    fixture = TestBed.createComponent(ReportesPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  const apretar = async (etiqueta: string) => {
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    )
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar();
  });

  it('"Sancionar" y "Descartar" son botones de la primitiva, no hechos a mano (TV7.9)', () => {
    // Hechos a mano no heredaban nada de .boton: ni el alto, ni la letra, ni el
    // foco, ni la confirmación al apretar (hallazgo de TV2.3).
    const botones = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li button'));

    expect(botones.map((b) => b.textContent?.trim().split(/\s/)[0])).toEqual([
      'Sancionar',
      'Descartar',
    ]);
    expect(botones.every((b) => b.classList.contains('boton'))).toBe(true);
  });

  it('muestra la hora en la hora del club, la cancha y a quién se le reservó', () => {
    expect(texto()).toContain('08:00');
    expect(texto()).toContain('Cancha 1');
    expect(texto()).toContain('Carolina Díaz');
  });

  it('dice cuántos avisaron por la misma hora', () => {
    // Dos avisos distintos pesan más que uno, y es lo único que el admin tiene
    // para calibrar sin saber quiénes son.
    expect(texto()).toContain('2 reportes');
  });

  it('nunca dice quién reportó, porque no lo sabe', () => {
    expect(texto()).not.toMatch(/report(ó|o) .*(socio|Felipe)/i);
    expect(JSON.stringify(UNA)).not.toContain('reportante');
  });

  it('sancionar dice hasta qué día queda sancionado el socio', async () => {
    await apretar('Sancionar');

    expect(api.resolver).toHaveBeenCalledWith(25, 'SANCIONAR');
    expect(texto()).toContain('05-09-2026');
  });

  it('descartar no habla de sanciones', async () => {
    api.resolver.mockResolvedValue({ sancionadoHasta: null });

    await apretar('Descartar');

    expect(api.resolver).toHaveBeenCalledWith(25, 'DESCARTAR');
    expect(texto()).toContain('Sin sanción');
  });

  it('una hora de visitante no ofrece sancionar', async () => {
    // No hay ficha ni cupo que suspender: el servidor responde 409 y ofrecerlo
    // sería un botón que solo sabe fallar.
    await montar([{ ...UNA, socio: null }]);

    expect(texto()).toContain('visitante');
    expect(
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ).map((b) => b.textContent?.trim()),
    ).not.toContain('Sancionar');
  });

  it('sin reportes pendientes lo dice, en vez de una lista vacía', async () => {
    await montar([]);

    expect(texto()).toContain('No hay horas reportadas');
  });
});
