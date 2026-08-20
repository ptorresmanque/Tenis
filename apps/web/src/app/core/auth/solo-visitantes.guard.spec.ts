import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Auth, UsuarioActual } from './auth';
import { soloVisitantes } from './solo-visitantes.guard';

/**
 * T27. Esconder el enlace de "Crear cuenta" no alcanza: la URL sigue viva y el
 * historial del navegador la ofrece sola.
 */
describe('soloVisitantes', () => {
  const SOCIA: UsuarioActual = {
    id: 2,
    nombre: 'Camila',
    email: 'camila@clubdetenis.cl',
    esAdmin: false,
    socioId: 7,
    socioActivo: true,
    socioAlDia: true,
    profesorId: null,
  };

  function correrCon(usuario: UsuarioActual | null) {
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
          },
        },
      ],
    });

    return TestBed.runInInjectionContext(() =>
      soloVisitantes(null as never, null as never),
    );
  }

  it('deja pasar a quien no tiene sesión', async () => {
    expect(await correrCon(null)).toBe(true);
  });

  it('devuelve al inicio a quien ya entró', async () => {
    const resultado = await correrCon(SOCIA);

    expect(TestBed.inject(Router).serializeUrl(resultado as UrlTree)).toBe('/');
  });
});
