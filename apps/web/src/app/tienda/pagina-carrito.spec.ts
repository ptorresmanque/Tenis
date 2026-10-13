import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { Auth, UsuarioActual } from '../core/auth/auth';
import { Carrito, Cotizacion, LineaCotizada, LineaDelCarrito } from './carrito';
import { PaginaDelCarrito } from './pagina-carrito';

/**
 * T163. La página del carrito, `/tienda/carrito`. **Lo que muestra sale siempre de
 * cotizar**: del navegador viene qué y cuánto, nada más.
 */
describe('PaginaDelCarrito', () => {
  const linea = (datos: Partial<LineaCotizada>): LineaCotizada => ({
    varianteId: 10,
    cantidad: 1,
    producto: { id: 5, nombre: 'Gel Resolution 9', marca: 'Asics', foto: null },
    talla: 'CL 40 · US 8 · EU 41',
    precioUnitarioClp: 129990,
    descuentoUnitarioClp: 0,
    subtotalClp: 129990,
    disponible: 4,
    porEncargo: false,
    diasEncargo: null,
    estado: 'ok',
    ...datos,
  });

  const cotizacion = (lineas: LineaCotizada[], datos: Partial<Cotizacion> = {}): Cotizacion => ({
    lineas,
    subtotalClp: lineas.reduce((t, l) => t + (l.precioUnitarioClp ?? 0) * l.cantidad, 0),
    descuentoClp: 0,
    totalClp: lineas.reduce((t, l) => t + l.subtotalClp, 0),
    sePuedePagar: lineas.every((l) => l.estado === 'ok'),
    sePuedeDespachar: !lineas.some((l) => l.porEncargo),
    ...datos,
  });

  const ZAPATILLA = linea({});
  const TUBO = linea({
    varianteId: 20,
    cantidad: 3,
    producto: {
      id: 6,
      nombre: 'Tubo Head Tour',
      marca: null,
      foto: '/api/tienda/fotos/3/miniatura',
    },
    talla: 'Única',
    precioUnitarioClp: 6990,
    subtotalClp: 20970,
  });

  const montar = async (
    respuesta: Cotizacion,
    opciones: {
      lineas?: LineaDelCarrito[];
      usuario?: UsuarioActual | null;
      /** El `?pago=` con que vuelve de Webpay (T166). */
      pago?: string;
    } = {},
  ) => {
    const lineas = signal<LineaDelCarrito[]>(
      opciones.lineas ??
        respuesta.lineas.map(({ varianteId, cantidad }) => ({ varianteId, cantidad })),
    );
    const usuario = signal<UsuarioActual | null>(opciones.usuario ?? null);
    const carrito = {
      lineas,
      cambiar: vi.fn(),
      quitar: vi.fn(),
      cotizar: vi.fn().mockResolvedValue(respuesta),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Carrito, useValue: carrito },
        { provide: Auth, useValue: { usuario } },
      ],
    });
    const fixture = TestBed.createComponent(PaginaDelCarrito);
    if (opciones.pago) fixture.componentRef.setInput('pago', opciones.pago);
    const elemento = fixture.nativeElement as HTMLElement;
    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await estable();

    const filas = () => Array.from(elemento.querySelectorAll<HTMLElement>('[data-linea]'));
    const resumen = () =>
      (elemento.querySelector('[data-resumen]')?.textContent ?? '').replace(/\s+/g, ' ');

    return { elemento, carrito, lineas, usuario, estable, filas, resumen };
  };

  it('vacío, lo dice y lleva a la tienda, sin preguntarle nada a la API', async () => {
    const { elemento, carrito } = await montar(cotizacion([]), { lineas: [] });

    expect(elemento.textContent).toContain('Tu carrito está vacío');
    expect(elemento.querySelector('a[href="/tienda"]')).not.toBeNull();
    expect(carrito.cotizar).not.toHaveBeenCalled();
  });

  it('**cotiza lo que hay en el carrito** y muestra cada línea con lo que dice la API', async () => {
    const { carrito, filas } = await montar(cotizacion([ZAPATILLA, TUBO]));

    expect(carrito.cotizar).toHaveBeenCalledWith([
      { varianteId: 10, cantidad: 1 },
      { varianteId: 20, cantidad: 3 },
    ]);
    const [zapatilla, tubo] = filas();
    expect(zapatilla.textContent).toContain('Gel Resolution 9');
    expect(zapatilla.textContent).toContain('Asics');
    expect(zapatilla.textContent).toContain('CL 40 · US 8 · EU 41');
    expect(zapatilla.querySelector('a')?.getAttribute('href')).toBe('/tienda/5');
    expect(tubo.textContent).toContain('$6.990');
    expect(tubo.textContent).toContain('$20.970');
    expect(tubo.querySelector('img')?.getAttribute('src')).toBe('/api/tienda/fotos/3/miniatura');
  });

  it('el resumen: subtotal, descuento de socio y total', async () => {
    const conDescuento = linea({ descuentoUnitarioClp: 19499, subtotalClp: 110491 });
    const { resumen } = await montar(
      cotizacion([conDescuento], { subtotalClp: 129990, descuentoClp: 19499, totalClp: 110491 }),
    );

    expect(resumen()).toContain('$129.990');
    expect(resumen()).toContain('Descuento de socio');
    expect(resumen()).toContain('−$19.499');
    expect(resumen()).toContain('$110.491');
  });

  it('sin descuento, no hay línea de descuento', async () => {
    const { resumen } = await montar(cotizacion([ZAPATILLA]));

    expect(resumen()).not.toContain('Descuento');
  });

  it('cambiar la cantidad y quitar van al carrito', async () => {
    const { carrito, filas, estable } = await montar(cotizacion([ZAPATILLA, TUBO]));

    const cantidad = filas()[1].querySelector<HTMLInputElement>('input[type="number"]')!;
    cantidad.value = '5';
    cantidad.dispatchEvent(new Event('change'));
    Array.from(filas()[0].querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Quitar'))!
      .click();
    await estable();

    expect(carrito.cambiar).toHaveBeenCalledWith(20, 5);
    expect(carrito.quitar).toHaveBeenCalledWith(10);
  });

  it('**vuelve a cotizar cuando cambia el carrito**', async () => {
    const { carrito, lineas, estable } = await montar(cotizacion([ZAPATILLA]));

    lineas.set([{ varianteId: 10, cantidad: 2 }]);
    await estable();

    expect(carrito.cotizar).toHaveBeenLastCalledWith([{ varianteId: 10, cantidad: 2 }]);
  });

  it('**vuelve a cotizar al iniciar sesión**: el socio ve su precio sin recargar', async () => {
    const { carrito, usuario, estable } = await montar(cotizacion([ZAPATILLA]));

    usuario.set({ id: 2, socioId: 7, socioActivo: true, socioAlDia: true } as UsuarioActual);
    await estable();

    expect(carrito.cotizar).toHaveBeenCalledTimes(2);
  });

  describe('la vuelta de Webpay sin pagar (T166)', () => {
    it.each([
      ['rechazado', 'El pago fue rechazado'],
      ['anulado', 'No terminaste el pago'],
      ['invalido', 'No pudimos confirmar ese pago'],
    ])('?pago=%s lo dice, con el carrito intacto para reintentar', async (pago, aviso) => {
      const { elemento, filas } = await montar(cotizacion([ZAPATILLA]), { pago });

      expect(elemento.querySelector('app-aviso')?.textContent).toContain(aviso);
      expect(filas()).toHaveLength(1);
    });

    it('sin volver de Webpay, no hay aviso', async () => {
      const { elemento } = await montar(cotizacion([ZAPATILLA]));

      expect(elemento.querySelector('app-aviso')).toBeNull();
    });
  });

  it('**lo que va por encargo dice cuándo llega** y que se retira en el club (T170)', async () => {
    const { filas } = await montar(
      cotizacion([linea({ disponible: 0, porEncargo: true, diasEncargo: 7 })]),
    );

    expect(filas()[0].textContent).toContain('Por encargo: llega en 7 días');
    expect(filas()[0].textContent).toContain('se retira en el club');
  });

  describe('lo que no se puede comprar', () => {
    it('**todo disponible: se puede ir a pagar** (T166)', async () => {
      const { elemento } = await montar(cotizacion([ZAPATILLA]));

      expect(elemento.querySelector('a[href="/tienda/pagar"]')).not.toBeNull();
    });

    it('**lo que ya no se vende lo dice, y no deja seguir**', async () => {
      const { elemento, filas } = await montar(
        cotizacion([
          linea({ estado: 'no-disponible', precioUnitarioClp: null, subtotalClp: 0 }),
          linea({ varianteId: 30, estado: 'no-disponible', producto: null, talla: null }),
        ]),
      );

      expect(filas()[0].textContent).toContain('Ya no está a la venta');
      // Del que no existe no se sabe ni el nombre, pero se puede quitar igual.
      expect(filas()[1].textContent).toContain('Un producto que ya no está a la venta');
      expect(filas()[1].querySelector('button')?.textContent).toContain('Quitar');
      expect(elemento.querySelector('a[href="/tienda/pagar"]')).toBeNull();
      expect(elemento.textContent).toContain('para seguir');
    });

    it('más de lo que queda: dice cuánto queda; si no queda nada, que se agotó', async () => {
      const { filas, elemento } = await montar(
        cotizacion([
          linea({ cantidad: 3, disponible: 2, estado: 'sin-stock' }),
          linea({ varianteId: 20, disponible: 0, estado: 'sin-stock' }),
        ]),
      );

      expect(filas()[0].textContent).toContain('Quedan 2');
      expect(filas()[1].textContent).toContain('Se agotó');
      expect(elemento.querySelector('a[href="/tienda/pagar"]')).toBeNull();
    });
  });
});
