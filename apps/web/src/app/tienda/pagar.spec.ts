import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Auth, UsuarioActual } from '../core/auth/auth';
import { Carrito, Cotizacion, LineaDelCarrito } from './carrito';
import { PaginaDePago } from './pagar';
import { Tienda } from './tienda.service';

/**
 * T166. Pagar, `/tienda/pagar`: los datos, la entrega, el documento y, **sobre el botón y
 * a la vista**, el derecho a retracto y la garantía legal (`SPEC-tienda.md` § Legal).
 */
describe('PaginaDePago', () => {
  const COTIZACION: Cotizacion = {
    lineas: [
      {
        varianteId: 10,
        cantidad: 1,
        producto: { id: 5, nombre: 'Pure Drive', marca: 'Babolat', foto: null },
        talla: 'Grip 2',
        precioUnitarioClp: 249990,
        descuentoUnitarioClp: 0,
        subtotalClp: 249990,
        disponible: 3,
        porEncargo: false,
        diasEncargo: null,
        estado: 'ok',
      },
    ],
    subtotalClp: 249990,
    descuentoClp: 0,
    totalClp: 249990,
    sePuedePagar: true,
    sePuedeDespachar: true,
  };

  const CAMILA = {
    id: 2,
    nombre: 'Camila',
    apellido: 'Rojas',
    email: 'camila@correo.test',
    telefono: '56987654321',
  } as UsuarioActual;

  const montar = async (
    opciones: {
      lineas?: LineaDelCarrito[];
      usuario?: UsuarioActual | null;
      cotizacion?: Cotizacion;
      /** Una función y no la promesa: rechazada antes de que alguien la espere, Vitest la
       * cuenta como un rechazo sin manejar. */
      crear?: () => Promise<{ token: string; totalClp: number }>;
    } = {},
  ) => {
    const tienda = {
      regiones: vi.fn().mockResolvedValue(['Metropolitana de Santiago', 'La Araucanía']),
      crearPedido: vi
        .fn()
        .mockImplementation(
          opciones.crear ?? (() => Promise.resolve({ token: 'tok-1', totalClp: 249990 })),
        ),
      pagarPedido: vi.fn().mockResolvedValue({
        totalClp: 249990,
        urlRedireccion: 'https://pasarela.local/pagar',
        tokenPasarela: 'tbk-1',
      }),
    };
    const carrito = {
      lineas: signal(opciones.lineas ?? [{ varianteId: 10, cantidad: 1 }]),
      cotizar: vi.fn().mockResolvedValue(opciones.cotizacion ?? COTIZACION),
      recordarPago: vi.fn(),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Tienda, useValue: tienda },
        { provide: Carrito, useValue: carrito },
        { provide: Auth, useValue: { usuario: signal(opciones.usuario ?? null) } },
      ],
    });
    const fixture = TestBed.createComponent(PaginaDePago);
    const elemento = fixture.nativeElement as HTMLElement;
    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await estable();

    const campo = (nombre: string) =>
      elemento.querySelector<HTMLInputElement & HTMLSelectElement>(`[name="${nombre}"]`)!;
    const escribir = async (nombre: string, valor: string) => {
      const control = campo(nombre);
      control.value = valor;
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input'));
      await estable();
    };
    const marcar = async (nombre: string, valor?: string) => {
      const control = valor
        ? // `[value]` de Angular es la propiedad, no el atributo: se busca por la propiedad.
          Array.from(elemento.querySelectorAll<HTMLInputElement>(`[name="${nombre}"]`)).find(
            (c) => c.value === valor,
          )!
        : campo(nombre);
      control.click();
      await estable();
    };
    const enviar = async () => {
      elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
      await estable();
    };

    return { elemento, tienda, carrito, estable, campo, escribir, marcar, enviar };
  };

  beforeEach(() => {
    // jsdom no navega: el formulario a Webpay se arma, pero no se envía.
    HTMLFormElement.prototype.submit = vi.fn();
  });

  it('con el carrito vacío, no hay nada que pagar', async () => {
    const { elemento } = await montar({ lineas: [] });

    expect(elemento.textContent).toContain('Tu carrito está vacío');
    expect(elemento.querySelector('form')).toBeNull();
  });

  it('**con sesión, los datos vienen precargados**', async () => {
    const { campo } = await montar({ usuario: CAMILA });

    expect(campo('nombre').value).toBe('Camila Rojas');
    expect(campo('email').value).toBe('camila@correo.test');
    expect(campo('telefono').value).toBe('987654321');
  });

  it('**el despacho pide la región de la lista y la dirección, y dice que es por pagar**', async () => {
    const { elemento, campo, marcar } = await montar();
    expect(campo('region')).toBeNull();

    await marcar('entrega', 'DESPACHO');

    const regiones = Array.from(campo('region').options).map((o) => o.textContent?.trim());
    expect(regiones).toEqual(['Elige la región', 'Metropolitana de Santiago', 'La Araucanía']);
    expect(campo('comuna')).not.toBeNull();
    expect(campo('direccion')).not.toBeNull();
    expect(elemento.textContent).toContain('por pagar a Starken');
  });

  it('**con algo por encargo, no ofrece despacho** y dice por qué (T170)', async () => {
    const { elemento } = await montar({
      cotizacion: { ...COTIZACION, sePuedeDespachar: false },
    });

    const opciones = Array.from(
      elemento.querySelectorAll<HTMLInputElement>('[name="entrega"]'),
    ).map((r) => r.value);
    expect(opciones).toEqual(['RETIRO']);
    expect(elemento.textContent).toContain('Lo que va por encargo se retira en el club');
  });

  it('quien necesita factura deja los datos de la empresa', async () => {
    const { campo, marcar } = await montar();
    expect(campo('rut')).toBeNull();

    await marcar('factura');

    expect(campo('rut')).not.toBeNull();
    expect(campo('razonSocial')).not.toBeNull();
    expect(campo('giro')).not.toBeNull();
  });

  it('**el retracto y la garantía van a la vista, antes del botón**', async () => {
    const { elemento } = await montar();

    const legal = elemento.querySelector('[data-legal]')!;
    const boton = Array.from(elemento.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pagar'),
    )!;
    expect(legal.textContent).toContain('Derecho a retracto');
    expect(legal.textContent).toContain('Garantía legal');
    expect(legal.querySelector('a')?.getAttribute('href')).toBe('/tienda/terminos');
    expect(legal.compareDocumentPosition(boton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(boton.textContent).toContain('$249.990');
  });

  it('**pagar crea el pedido con lo del carrito y los datos, y sale a Webpay**', async () => {
    const { tienda, carrito, escribir, marcar, enviar } = await montar({ usuario: CAMILA });
    await marcar('entrega', 'DESPACHO');
    await escribir('region', 'La Araucanía');
    await escribir('comuna', 'Temuco');
    await escribir('direccion', 'Los Aromos 345');

    await enviar();

    expect(tienda.crearPedido).toHaveBeenCalledWith({
      lineas: [{ varianteId: 10, cantidad: 1 }],
      nombre: 'Camila Rojas',
      email: 'camila@correo.test',
      telefono: '56987654321',
      entrega: 'DESPACHO',
      despacho: {
        region: 'La Araucanía',
        comuna: 'Temuco',
        direccion: 'Los Aromos 345',
        referencia: '',
      },
      factura: null,
    });
    expect(tienda.pagarPedido).toHaveBeenCalledWith('tok-1');
    // Para vaciar el carrito al volver pagado, y solo con este pedido.
    expect(carrito.recordarPago).toHaveBeenCalledWith('tok-1');
    const salida = document.body.querySelector<HTMLFormElement>(
      'form[action="https://pasarela.local/pagar"]',
    );
    expect(salida?.querySelector<HTMLInputElement>('[name="token_ws"]')?.value).toBe('tbk-1');
  });

  it('con retiro, no manda dirección; sin factura, tampoco sus datos', async () => {
    const { tienda, escribir, enviar } = await montar();
    await escribir('nombre', 'Camila Rojas');
    await escribir('email', 'camila@correo.test');
    await escribir('telefono', '987654321');

    await enviar();

    expect(tienda.crearPedido).toHaveBeenCalledWith(
      expect.objectContaining({ entrega: 'RETIRO', despacho: null, factura: null }),
    );
  });

  it('**si se agotó mientras compraba, lo dice y lleva al carrito**', async () => {
    const { elemento, tienda, enviar } = await montar({
      usuario: CAMILA,
      crear: () =>
        Promise.reject(
          new HttpErrorResponse({
            status: 409,
            error: {
              message: 'Se agotó mientras comprabas: ya no queda Babolat Pure Drive · Grip 2.',
            },
          }),
        ),
    });

    await enviar();

    expect(elemento.textContent).toContain('Se agotó mientras comprabas');
    expect(elemento.querySelector('[data-resumen] a[href="/tienda/carrito"]')).not.toBeNull();
    expect(tienda.pagarPedido).not.toHaveBeenCalled();
  });

  it('con algo que ya no se puede comprar, no deja pagar y manda al carrito', async () => {
    const { elemento } = await montar({
      cotizacion: { ...COTIZACION, sePuedePagar: false },
    });

    expect(elemento.querySelector('form')).toBeNull();
    expect(elemento.querySelector('a[href="/tienda/carrito"]')).not.toBeNull();
  });
});
