import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { App } from './app';
import { Auth, UsuarioActual } from './core/auth/auth';

/**
 * T27. La barra de navegación tiene que decir la verdad sobre quién está mirando.
 *
 * Ofrecerle "Crear cuenta" a quien ya entró es una invitación a un formulario que no
 * le sirve, y "Estado" —el diagnóstico del sistema— no es una pantalla del socio.
 */
describe('App: la navegación', () => {
  const ADMIN: UsuarioActual = {
    id: 1,
    nombre: 'Rodrigo',
    email: 'admin@clubdetenis.cl',
    esAdmin: true,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };

  const SOCIA: UsuarioActual = {
    ...ADMIN,
    id: 2,
    nombre: 'Camila',
    email: 'camila@clubdetenis.cl',
    esAdmin: false,
    socioId: 7,
    socioActivo: true,
    socioAlDia: true,
  };

  /** Los enlaces de la barra, tal como los lee alguien que mira la pantalla. */
  function enlacesCon(usuario: UsuarioActual | null): string[] {
    const estado = signal(usuario);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            usuario: estado.asReadonly(),
            esAdmin: computed(() => estado()?.esAdmin === true),
            refrescar: () => Promise.resolve(),
            salir: () => Promise.resolve(),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('header a'),
    ].map((enlace) => enlace.textContent?.trim() ?? '');
  }

  it('le ofrece crear cuenta a quien no ha entrado', () => {
    expect(enlacesCon(null)).toContain('Crear cuenta');
  });

  it('no le ofrece crear cuenta a quien ya tiene sesión', () => {
    expect(enlacesCon(SOCIA)).not.toContain('Crear cuenta');
  });

  it('no le muestra el estado del sistema a una socia', () => {
    // Y sí lo demás que le corresponde: la prueba no puede pasar por haber
    // vaciado la barra.
    expect(enlacesCon(SOCIA)).toContain('Mis reservas');
    expect(enlacesCon(SOCIA)).not.toContain('Estado');
  });

  it('no le muestra el estado del sistema a quien no entró', () => {
    expect(enlacesCon(null)).not.toContain('Estado');
  });

  it('se lo muestra al admin', () => {
    expect(enlacesCon(ADMIN)).toContain('Estado');
  });
});
