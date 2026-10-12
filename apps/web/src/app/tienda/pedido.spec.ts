import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';

import { Carrito } from './carrito';
import { PaginaDelPedido } from './pedido';
import { PedidoPublico, Tienda } from './tienda.service';

/**
 * T166. `/tienda/pedido/:token` es a la vez la confirmación y el seguimiento: la página que
 * abre la vuelta de Webpay y la que abre el enlace del correo.
 */
describe('PaginaDelPedido', () => {
  const PEDIDO: PedidoPublico = {
    id: 12,
    token: 'tok-1',
    estado: 'PAGADO',
    entrega: 'RETIRO',
    nombre: 'Camila Rojas',
    email: 'camila@correo.test',
    region: null,
    comuna: null,
    direccion: null,
    referencia: null,
    numeroSeguimiento: null,
    totalClp: 263970,
    descuentoSocioClp: 0,
    documento: 'VOUCHER',
    facturaRazonSocial: null,
    creadoEn: '2026-10-12T15:00:00.000Z',
    pagadoEn: '2026-10-12T15:03:00.000Z',
    listoEn: null,
    despachadoEn: null,
    entregadoEn: null,
    lineas: [
      {
        descripcion: 'Babolat Pure Drive · Grip 2',
        cantidad: 1,
        precioUnitarioClp: 249990,
        descuentoUnitarioClp: 0,
        esEncargo: false,
      },
      {
        descripcion: 'Head Tour · Única',
        cantidad: 2,
        precioUnitarioClp: 6990,
        descuentoUnitarioClp: 0,
        esEncargo: false,
      },
    ],
  };

  const montar = async (url: string, pedido: PedidoPublico | null = PEDIDO) => {
    const tienda = { pedido: vi.fn().mockResolvedValue(pedido) };
    const carrito = { pagado: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'tienda/pedido/:token', component: PaginaDelPedido }],
          withComponentInputBinding(),
        ),
        { provide: Tienda, useValue: tienda },
        { provide: Carrito, useValue: carrito },
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    await harness.fixture.whenStable();
    harness.detectChanges();

    return { elemento: harness.routeNativeElement!, tienda, carrito };
  };

  const texto = (elemento: HTMLElement) => (elemento.textContent ?? '').replace(/\s+/g, ' ');

  it('**muestra el estado, las líneas, el total y la entrega**', async () => {
    const { elemento, tienda } = await montar('/tienda/pedido/tok-1');

    expect(tienda.pedido).toHaveBeenCalledWith('tok-1');
    expect(elemento.querySelector('h1')?.textContent).toContain('Pedido N.º 12');
    expect(texto(elemento)).toContain('Pagado');
    expect(texto(elemento)).toContain('1 × Babolat Pure Drive · Grip 2');
    expect(texto(elemento)).toContain('$13.980');
    expect(texto(elemento)).toContain('$263.970');
    expect(texto(elemento)).toContain('Retiro en el club');
  });

  it('**al volver de Webpay con el pago listo, lo celebra**', async () => {
    const { elemento } = await montar('/tienda/pedido/tok-1?pago=listo');

    expect(texto(elemento)).toContain('Pago recibido');
  });

  it('**pagado, le avisa al carrito**, que se vacía solo si el pedido salió de él', async () => {
    const { carrito } = await montar('/tienda/pedido/tok-1');

    expect(carrito.pagado).toHaveBeenCalledWith('tok-1');
  });

  it('con ?pago=listo pero el pedido sin pagar, no celebra ni toca el carrito', async () => {
    // El monto que no cuadra: pagos deja la transacción en revisión y no paga el pedido.
    const { elemento, carrito } = await montar('/tienda/pedido/tok-1?pago=listo', {
      ...PEDIDO,
      estado: 'PENDIENTE_PAGO',
      pagadoEn: null,
    });

    expect(texto(elemento)).not.toContain('Pago recibido');
    expect(carrito.pagado).not.toHaveBeenCalled();
  });

  it('con despacho, la dirección y el número de seguimiento cuando sale', async () => {
    const { elemento } = await montar('/tienda/pedido/tok-1', {
      ...PEDIDO,
      estado: 'DESPACHADO',
      entrega: 'DESPACHO',
      region: 'La Araucanía',
      comuna: 'Temuco',
      direccion: 'Los Aromos 345',
      numeroSeguimiento: 'STK123456',
      despachadoEn: '2026-10-13T12:00:00.000Z',
    });

    expect(texto(elemento)).toContain('Despachado');
    expect(texto(elemento)).toContain('Los Aromos 345, Temuco, La Araucanía');
    expect(texto(elemento)).toContain('STK123456');
    expect(texto(elemento)).toContain('por pagar');
  });

  it('**un pedido que no se pagó lo dice, y lleva al carrito**', async () => {
    const { elemento } = await montar('/tienda/pedido/tok-1', {
      ...PEDIDO,
      estado: 'EXPIRADO',
      pagadoEn: null,
    });

    expect(texto(elemento)).toContain('No se pagó');
    expect(elemento.querySelector('a[href="/tienda/carrito"]')).not.toBeNull();
  });

  it('un enlace que no es de ningún pedido lo dice', async () => {
    const { elemento } = await montar('/tienda/pedido/otro', null);

    expect(texto(elemento)).toContain('No encontramos ese pedido');
  });
});
