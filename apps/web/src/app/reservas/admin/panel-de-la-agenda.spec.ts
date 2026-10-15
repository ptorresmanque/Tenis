import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Auth, UsuarioActual } from '../../core/auth/auth';
import { PanelDeLaAgenda } from './panel-de-la-agenda';

/**
 * T285 (SPEC-panel.md D5). La agenda y la ocupación de cancha, en una pantalla con pestañas.
 * La ocupación es del admin: el gestor ve la agenda sola, sin una barra de una pestaña.
 */
describe('El panel de la agenda', () => {
  const NADIE: UsuarioActual = {
    id: 1,
    nombre: 'Ana',
    apellido: 'Rojas',
    email: 'ana@ejemplo.cl',
    telefono: null,
    esAdmin: false,
    esGestor: false,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };

  const montar = (usuario: UsuarioActual) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: { usuario: signal(usuario) } }],
    });
    const fixture = TestBed.createComponent(PanelDeLaAgenda);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('se titula como su ítem del menú', () => {
    expect(montar({ ...NADIE, esAdmin: true }).querySelector('h1')?.textContent?.trim()).toBe(
      'Agenda del día',
    );
  });

  it('**al admin, las pestañas Agenda y Ocupación**', () => {
    const el = montar({ ...NADIE, esAdmin: true });
    const pestanas = [...el.querySelectorAll('nav[mat-tab-nav-bar] a')];

    expect(pestanas.map((a) => a.textContent?.trim())).toEqual(['Agenda', 'Ocupación']);
    expect(pestanas.map((a) => a.getAttribute('href'))).toEqual([
      '/administracion/reservas',
      '/administracion/reservas/ocupacion',
    ]);
  });

  it('**al gestor, la agenda sin barra de pestañas** (A3)', () => {
    const el = montar({ ...NADIE, esGestor: true });

    expect(el.querySelector('nav[mat-tab-nav-bar]')).toBeNull();
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });
});
