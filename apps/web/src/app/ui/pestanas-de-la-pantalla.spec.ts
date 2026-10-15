import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { PestanaDeLaPantalla, PestanasDeLaPantalla } from './pestanas-de-la-pantalla';

/**
 * T286 (SPEC-panel.md A2). Las pestañas de una pantalla del panel: una ruta por pestaña, en el
 * molde de Configuración (T262), compartidas por la agenda, Finanzas, Horas no usadas y Canchas.
 */
describe('Las pestañas de la pantalla', () => {
  @Component({
    imports: [PestanasDeLaPantalla],
    template: `<app-pestanas-de-la-pantalla etiqueta="Secciones de prueba" [pestanas]="pestanas()" />`,
  })
  class Anfitrion {
    readonly pestanas = signal<PestanaDeLaPantalla[]>([]);
  }

  const montar = (pestanas: PestanaDeLaPantalla[]) => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Anfitrion);
    fixture.componentInstance.pestanas.set(pestanas);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('**una pestaña por ruta, con el nombre de la barra para el lector**', () => {
    const el = montar([
      { ruta: '/administracion/finanzas/ingreso', etiqueta: 'Ingreso' },
      { ruta: '/administracion/finanzas/cuotas', etiqueta: 'Cuotas' },
    ]);
    const barra = el.querySelector('nav[mat-tab-nav-bar]');

    expect(barra?.getAttribute('aria-label')).toBe('Secciones de prueba');
    expect([...barra!.querySelectorAll('a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['Ingreso', '/administracion/finanzas/ingreso'],
      ['Cuotas', '/administracion/finanzas/cuotas'],
    ]);
    expect(el.querySelector('mat-tab-nav-panel router-outlet')).not.toBeNull();
  });

  it('**una pestaña puede llevar un badge con su número y su descripción** (T287, A10)', () => {
    const el = montar([
      { ruta: '/administracion/no-uso/por-revisar', etiqueta: 'Por revisar', insignia: 3, descripcion: '3 horas por revisar' },
      { ruta: '/administracion/no-uso/periodo', etiqueta: 'Período' },
    ]);
    const [conBadge, sinBadge] = [...el.querySelectorAll('nav[mat-tab-nav-bar] a')];

    expect(conBadge.querySelector('.mat-badge-content')?.textContent?.trim()).toBe('3');
    // El lector oye «Por revisar: 3 horas por revisar», no un «3» suelto (el número es
    // aria-hidden). Va como texto oculto: matBadgeDescription no llega al lector en este caso.
    expect(conBadge.querySelector('.sr-only')?.textContent).toBe(': 3 horas por revisar');
    expect(sinBadge.querySelector('.mat-badge-content')).toBeNull();
  });

  it('sin nada que esperar, no hay badge', () => {
    const el = montar([
      { ruta: '/a', etiqueta: 'Por revisar', insignia: 0, descripcion: 'nada' },
      { ruta: '/b', etiqueta: 'Período' },
    ]);

    expect(el.querySelector('.mat-badge')?.classList).toContain('mat-badge-hidden');
  });

  it('**con una sola pestaña no hay barra**: solo el contenido (A3)', () => {
    const el = montar([{ ruta: '/administracion/reservas', etiqueta: 'Agenda' }]);

    expect(el.querySelector('nav[mat-tab-nav-bar]')).toBeNull();
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });
});
