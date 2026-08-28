import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Auth, UsuarioActual } from './auth';
import { soloAdmin } from './solo-admin.guard';

/**
 * El guard de ruta es comodidad: lo que protege los datos es el `@SoloAdmin()` del
 * servidor. Aun así tiene que acertar, o manda a administración a quien no puede
 * usarla y deja fuera a quien sí.
 */
describe('soloAdmin', () => {
  const ADMIN: UsuarioActual = {
    id: 1,
    nombre: 'Rodrigo',
    apellido: 'Torres',
    telefono: null,
    email: 'admin@clubdetenis.cl',
    esAdmin: true,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };

  /** Corre el guard con una sesión ya resuelta. */
  function correrCon(usuario: UsuarioActual | null) {
    const estado = signal(usuario);
    const doble = {
      usuario: estado.asReadonly(),
      esAdmin: computed(() => estado()?.esAdmin === true),
      refrescar: () => Promise.resolve(),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: doble }],
    });

    // Los argumentos de ruta no se usan: el guard solo mira quién está adentro.
    return TestBed.runInInjectionContext(() =>
      soloAdmin(null as never, null as never),
    );
  }

  it('deja entrar al admin', async () => {
    expect(await correrCon(ADMIN)).toBe(true);
  });

  it('devuelve al inicio a un socio que ya entró', async () => {
    const resultado = await correrCon({ ...ADMIN, esAdmin: false, socioId: 4 });

    // Y no a la pantalla de ingreso: ya tiene sesión, ahí no hay nada que hacer.
    expect(TestBed.inject(Router).serializeUrl(resultado as UrlTree)).toBe('/');
  });

  it('manda al ingreso a quien no tiene sesión', async () => {
    const resultado = await correrCon(null);

    expect(TestBed.inject(Router).serializeUrl(resultado as UrlTree)).toBe(
      '/entrar',
    );
  });
});
