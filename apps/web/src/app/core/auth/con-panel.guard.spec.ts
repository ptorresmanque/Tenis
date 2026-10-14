import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';

import { routes } from '../../app.routes';
import { Auth, UsuarioActual } from './auth';
import { conPanel } from './con-panel.guard';

/**
 * El guard de ruta es comodidad: lo que protege los datos son los guards del servidor.
 * Aun así tiene que acertar, o manda al panel a quien no puede usarlo y deja fuera a
 * quien sí (T220: cada tipo, a lo suyo).
 */
describe('conPanel', () => {
  const NADIE: UsuarioActual = {
    id: 1,
    nombre: 'Rodrigo',
    apellido: 'Torres',
    telefono: null,
    email: 'admin@clubdetenis.cl',
    esAdmin: false,
    esGestor: false,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };
  const ADMIN = { ...NADIE, esAdmin: true };
  const GESTOR = { ...NADIE, esGestor: true };
  const PROFESOR = { ...NADIE, profesorId: 7 };

  /** Corre el guard con una sesión ya resuelta, como si se pidiera `url`. */
  async function correrCon(usuario: UsuarioActual | null, url: string) {
    const estado = signal(usuario);
    const doble = {
      usuario: estado.asReadonly(),
      refrescar: () => Promise.resolve(),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: doble }],
    });

    const resultado = await TestBed.runInInjectionContext(() =>
      conPanel(null as never, { url } as RouterStateSnapshot),
    );

    return resultado instanceof UrlTree
      ? TestBed.inject(Router).serializeUrl(resultado)
      : resultado;
  }

  it('deja entrar al admin a cualquier pantalla del panel', async () => {
    expect(await correrCon(ADMIN, '/administracion/canchas')).toBe(true);
  });

  it('deja al gestor en la agenda y al profesor en Clases', async () => {
    expect(await correrCon(GESTOR, '/administracion/reservas')).toBe(true);
    expect(await correrCon(PROFESOR, '/administracion/clases')).toBe(true);
  });

  it('al que pide una pantalla que no le toca lo devuelve a la suya (32)', async () => {
    expect(await correrCon(GESTOR, '/administracion/canchas')).toBe(
      '/administracion/reservas',
    );
    expect(await correrCon(PROFESOR, '/administracion/reservas')).toBe(
      '/administracion/clases',
    );
  });

  it('devuelve al inicio del sitio a un socio que ya entró (32)', async () => {
    // Y no a la pantalla de ingreso: ya tiene sesión, ahí no hay nada que hacer.
    expect(
      await correrCon({ ...NADIE, socioId: 4 }, '/administracion/reservas'),
    ).toBe('/');
  });

  it('manda al ingreso a quien no tiene sesión', async () => {
    expect(await correrCon(null, '/administracion/reservas')).toBe('/entrar');
  });

  it('el router lo corre al entrar directo a una pantalla de adentro, y al pasar a otra', async () => {
    @Component({ template: '' })
    class Vacia {}

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', component: Vacia },
          {
            path: '',
            canActivateChild: [conPanel],
            children: [
              { path: 'administracion/reservas', component: Vacia },
              { path: 'administracion/canchas', component: Vacia },
            ],
          },
        ]),
        {
          provide: Auth,
          useValue: {
            usuario: signal(GESTOR).asReadonly(),
            refrescar: () => Promise.resolve(),
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);

    await harness.navigateByUrl('/administracion/canchas');
    expect(router.url).toBe('/administracion/reservas');

    await harness.navigateByUrl('/administracion/canchas');
    expect(router.url).toBe('/administracion/reservas');
  });

  it('corre en cada pantalla del panel, no solo al entrar: va como canActivateChild', () => {
    // El cascarón del panel se carga con su ruta (I6): se lo reconoce por sus hijos.
    const panel = routes.find((ruta) =>
      ruta.children?.some((hijo) => hijo.path === 'administracion/reservas'),
    );

    expect(panel?.canActivateChild).toEqual([conPanel]);
  });
});
