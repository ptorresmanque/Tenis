import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Carrito } from './carrito';

/**
 * T163. El carrito vive en `localStorage` y **guarda solo ids y cantidades**: sobrevive a
 * recargar la página y a iniciar sesión en el mismo navegador, y un precio guardado ahí no
 * llega nunca a la API (`SPEC-tienda.md` § Comprar en línea).
 */
describe('Carrito', () => {
  const CLAVE = 'fedal:carrito';

  const montar = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const carrito = TestBed.inject(Carrito);

    return { carrito, http: TestBed.inject(HttpTestingController) };
  };

  /** Lo que quedó escrito, después de que el efecto que guarda alcance a correr. */
  const guardado = () => {
    TestBed.tick();

    return JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as unknown;
  };

  // Node 26 trae su propio `localStorage`, que sin archivo no existe y tapa el de jsdom.
  // Uno en memoria hace de navegador, y sobrevive entre "recargas" dentro de una prueba.
  const enMemoria = () => {
    const memoria = new Map<string, string>();
    return {
      getItem: (clave: string) => memoria.get(clave) ?? null,
      setItem: (clave: string, valor: string) => memoria.set(clave, valor),
      removeItem: (clave: string) => memoria.delete(clave),
    };
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', enMemoria());
    vi.stubGlobal('sessionStorage', enMemoria());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('agregar suma una línea, y agregar la misma variante suma unidades', () => {
    const { carrito } = montar();

    carrito.agregar(10, 1);
    carrito.agregar(11, 2);
    carrito.agregar(10, 2);

    expect(carrito.lineas()).toEqual([
      { varianteId: 10, cantidad: 3 },
      { varianteId: 11, cantidad: 2 },
    ]);
    expect(carrito.unidades()).toBe(5);
  });

  it('cambiar la cantidad, y llevarla a cero la quita', () => {
    const { carrito } = montar();
    carrito.agregar(10, 1);
    carrito.agregar(11, 1);

    carrito.cambiar(10, 4);
    carrito.cambiar(11, 0);

    expect(carrito.lineas()).toEqual([{ varianteId: 10, cantidad: 4 }]);
  });

  it('nunca pasa de 99 de una variante, que es lo que acepta la API', () => {
    const { carrito } = montar();

    carrito.agregar(10, 98);
    carrito.agregar(10, 5);

    expect(carrito.lineas()).toEqual([{ varianteId: 10, cantidad: 99 }]);
  });

  it('**una cantidad que no es un entero desde 1 no entra**: rompería el carrito entero', () => {
    const { carrito } = montar();
    carrito.agregar(10, 2);

    carrito.agregar(11, 0);
    carrito.agregar(12, Number.NaN);
    carrito.cambiar(10, 1.5);

    expect(carrito.lineas()).toEqual([{ varianteId: 10, cantidad: 2 }]);
  });

  it('**después de pagar se vacía solo si el pedido salió de este carrito, y una vez** (T166)', () => {
    const { carrito } = montar();
    carrito.agregar(10, 2);
    carrito.recordarPago('tok-1');

    // Otro pedido pagado —abierto desde un correo— no toca este carrito.
    carrito.pagado('tok-otro');
    expect(carrito.lineas()).toHaveLength(1);

    carrito.pagado('tok-1');
    expect(carrito.lineas()).toEqual([]);

    // Volver a abrir el mismo pedido más tarde, con otra compra en camino, tampoco.
    carrito.agregar(11, 1);
    carrito.pagado('tok-1');
    expect(carrito.lineas()).toEqual([{ varianteId: 11, cantidad: 1 }]);
  });

  it('quitar saca la línea', () => {
    const { carrito } = montar();
    carrito.agregar(10, 1);
    carrito.agregar(11, 1);

    carrito.quitar(10);

    expect(carrito.lineas()).toEqual([{ varianteId: 11, cantidad: 1 }]);
  });

  it('**se guarda en el navegador y sobrevive a recargar**', () => {
    const primera = montar().carrito;
    primera.agregar(10, 2);
    expect(guardado()).toEqual([{ varianteId: 10, cantidad: 2 }]);

    // Recargar es empezar de nuevo, con lo que quedó guardado.
    expect(montar().carrito.lineas()).toEqual([{ varianteId: 10, cantidad: 2 }]);
  });

  it('**un precio guardado en el navegador se descarta al leer**, y lo que no se entiende también', () => {
    localStorage.setItem(
      CLAVE,
      JSON.stringify([
        { varianteId: 10, cantidad: 2, precioClp: 1, totalClp: 1 },
        { varianteId: 'once', cantidad: 1 },
        { varianteId: 12, cantidad: 0 },
        { varianteId: 13, cantidad: 2.5 },
        null,
      ]),
    );

    expect(montar().carrito.lineas()).toEqual([{ varianteId: 10, cantidad: 2 }]);
  });

  it('un carrito guardado roto se trata como vacío, sin romper la página', () => {
    localStorage.setItem(CLAVE, '{esto no es json');

    expect(montar().carrito.lineas()).toEqual([]);
  });

  it('**cotizar manda solo ids y cantidades**', async () => {
    const { carrito, http } = montar();
    carrito.agregar(10, 2);

    const cotizacion = carrito.cotizar(carrito.lineas());
    const peticion = http.expectOne('/api/tienda/carrito/cotizar');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ lineas: [{ varianteId: 10, cantidad: 2 }] });
    peticion.flush({
      lineas: [],
      subtotalClp: 0,
      descuentoClp: 0,
      totalClp: 0,
      sePuedePagar: false,
    });

    expect((await cotizacion).totalClp).toBe(0);
  });
});
