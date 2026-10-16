import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Configuracion } from './configuracion';

/**
 * T290 (SPEC-panel.md D11). Las nueve pestañas de Configuración pasan a cinco: lo del club y los
 * servicios se juntan, cada parte en su panel.
 */
describe('Configuración', () => {
  const montar = () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Configuracion);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('se titula como su ítem del menú', () => {
    expect(montar().querySelector('h1')?.textContent?.trim()).toBe('Configuración');
  });

  it('**tiene cinco pestañas, cada una con su ruta**', () => {
    const pestanas = [...montar().querySelectorAll('nav[mat-tab-nav-bar] a')];

    expect(pestanas.map((a) => a.textContent?.trim())).toEqual([
      'Reglas y cuotas',
      'El club',
      'Servicios',
      'Categorías de juego',
      'Informe diario',
    ]);
    expect(pestanas.map((a) => a.getAttribute('href'))).toEqual([
      '/administracion/configuracion/reglas',
      '/administracion/configuracion/el-club',
      '/administracion/configuracion/servicios',
      '/administracion/configuracion/categorias-juego',
      '/administracion/configuracion/informe-diario',
    ]);
  });
});
