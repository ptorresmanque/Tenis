import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Finanzas } from './finanzas';

/** T286 (SPEC-panel.md D4). Ingreso, padrón, cuotas y deudores, en una pantalla con pestañas. */
describe('Finanzas', () => {
  const montar = () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Finanzas);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('se titula como su ítem del menú', () => {
    expect(montar().querySelector('h1')?.textContent?.trim()).toBe('Finanzas');
  });

  it('**tiene las cinco pestañas, en el orden que pidió el usuario**: Pagos, la última (T398)', () => {
    const pestanas = [...montar().querySelectorAll('nav[mat-tab-nav-bar] a')];

    expect(pestanas.map((a) => a.textContent?.trim())).toEqual([
      'Ingreso',
      'Padrón y morosidad',
      'Cuotas',
      'Socios con deuda',
      'Pagos',
    ]);
    expect(pestanas.map((a) => a.getAttribute('href'))).toEqual([
      '/administracion/finanzas/ingreso',
      '/administracion/finanzas/padron',
      '/administracion/finanzas/cuotas',
      '/administracion/finanzas/morosos',
      '/administracion/finanzas/pagos',
    ]);
  });
});
