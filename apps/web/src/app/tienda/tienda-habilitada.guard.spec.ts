import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { describe, expect, it } from 'vitest';

import { tiendaHabilitada } from './tienda-habilitada.guard';

/**
 * T157. Con la tienda apagada en este ambiente, entrar por la URL a su panel lleva al
 * inicio del panel, y desde T162 entrar a `/tienda` lleva a la portada. Como `soloAdmin`,
 * **es comodidad y no control**: la API igual responde 404 (T156).
 */
describe('tiendaHabilitada', () => {
  const correr = (url = '/administracion/tienda/productos') => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const resultado = TestBed.runInInjectionContext(() =>
      tiendaHabilitada({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;

    return { http, resultado };
  };

  it('con la tienda encendida, deja pasar', async () => {
    const { http, resultado } = correr();

    http.expectOne('/api/club').flush({ tiendaHabilitada: true });

    expect(await resultado).toBe(true);
  });

  it('con la tienda apagada, lleva al inicio del panel', async () => {
    const { http, resultado } = correr();

    http.expectOne('/api/club').flush({ tiendaHabilitada: false });

    expect(String(await resultado)).toBe('/administracion/reservas');
  });

  it('con la tienda apagada, la tienda del sitio lleva a la portada', async () => {
    const { http, resultado } = correr('/tienda/5');

    http.expectOne('/api/club').flush({ tiendaHabilitada: false });

    expect(String(await resultado)).toBe('/');
  });

  it('si no se puede preguntar, tampoco deja pasar', async () => {
    const { http, resultado } = correr();

    http.expectOne('/api/club').flush('caído', { status: 502, statusText: 'Bad Gateway' });

    expect(String(await resultado)).toBe('/administracion/reservas');
  });
});
