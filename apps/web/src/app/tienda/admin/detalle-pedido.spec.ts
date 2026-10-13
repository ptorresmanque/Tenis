import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { DetalleDePedidoPanel } from './detalle-pedido';
import { DetalleDePedido, PedidosDeLaTiendaAdmin } from './pedidos.service';

/**
 * T169. El detalle de un pedido en el panel: el contacto, la entrega, el documento, las
 * líneas y **solo las acciones de su estado**.
 */
describe('DetalleDePedidoPanel', () => {
  const PEDIDO: DetalleDePedido = {
    id: 12,
    token: 'tok-1',
    canal: 'EN_LINEA',
    estado: 'PAGADO',
    entrega: 'RETIRO',
    requiereRevision: false,
    nombre: 'Camila Rojas',
    email: 'camila@correo.test',
    telefono: '56987654321',
    region: null,
    comuna: null,
    direccion: null,
    referencia: null,
    numeroSeguimiento: null,
    totalClp: 263970,
    descuentoSocioClp: 0,
    medioPago: 'WEBPAY',
    documento: 'VOUCHER',
    folioDocumento: null,
    facturaRut: null,
    facturaRazonSocial: null,
    facturaGiro: null,
    facturaDireccion: null,
    creadoEn: '2026-10-12T15:00:00.000Z',
    pagadoEn: '2026-10-12T15:03:00.000Z',
    listoEn: null,
    despachadoEn: null,
    entregadoEn: null,
    lineas: [
      {
        id: 1,
        descripcion: 'Babolat Pure Drive · Grip 2',
        cantidad: 1,
        precioUnitarioClp: 249990,
        descuentoUnitarioClp: 0,
        esEncargo: false,
      },
    ],
  };

  const montar = async (pedido: DetalleDePedido, accion?: () => Promise<void>) => {
    const api = {
      detalle: vi.fn().mockResolvedValue(pedido),
      accion: vi.fn().mockImplementation(accion ?? (() => Promise.resolve())),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PedidosDeLaTiendaAdmin, useValue: api }],
    });
    const fixture = TestBed.createComponent(DetalleDePedidoPanel);
    fixture.componentRef.setInput('id', '12');
    const elemento = fixture.nativeElement as HTMLElement;
    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await estable();

    const botones = () =>
      Array.from(elemento.querySelectorAll('button')).map((b) => b.textContent?.trim());
    const apretar = async (texto: string) => {
      Array.from(elemento.querySelectorAll('button'))
        .find((b) => b.textContent?.includes(texto))!
        .click();
      await estable();
    };

    return { elemento, api, estable, botones, apretar };
  };

  const texto = (elemento: HTMLElement) => (elemento.textContent ?? '').replace(/\s+/g, ' ');

  it('el contacto, el documento y las líneas', async () => {
    const { elemento, api } = await montar(PEDIDO);

    expect(api.detalle).toHaveBeenCalledWith(12);
    expect(texto(elemento)).toContain('Pedido N.º 12');
    expect(texto(elemento)).toContain('camila@correo.test');
    expect(texto(elemento)).toContain('+56 9 8765 4321');
    expect(texto(elemento)).toContain('1 × Babolat Pure Drive · Grip 2');
    expect(texto(elemento)).toContain('$263.970');
    expect(texto(elemento)).toContain('Comprobante de Webpay');
  });

  it.each([
    ['pagado con retiro', { estado: 'PAGADO', entrega: 'RETIRO' }, ['Marcar listo para retirar']],
    ['pagado con despacho', { estado: 'PAGADO', entrega: 'DESPACHO' }, ['Marcar despachado']],
    [
      'listo para retirar',
      { estado: 'LISTO_PARA_RETIRO', entrega: 'RETIRO' },
      ['Marcar entregado'],
    ],
    ['despachado', { estado: 'DESPACHADO', entrega: 'DESPACHO' }, ['Marcar entregado']],
    ['entregado', { estado: 'ENTREGADO', entrega: 'RETIRO' }, []],
    ['sin pagar', { estado: 'EXPIRADO', entrega: 'RETIRO' }, []],
  ] as const)('**%s: solo sus acciones**', async (_caso, datos, esperadas) => {
    const { botones } = await montar({ ...PEDIDO, ...datos });

    expect(botones().filter((b) => b?.startsWith('Marcar'))).toEqual(esperadas);
  });

  it('**marcar listo** llama a la API, recarga y dice que se avisó al comprador', async () => {
    const { elemento, api, apretar } = await montar(PEDIDO);
    api.detalle.mockResolvedValue({ ...PEDIDO, estado: 'LISTO_PARA_RETIRO' });

    await apretar('Marcar listo para retirar');

    expect(api.accion).toHaveBeenCalledWith(12, 'listo', {});
    expect(api.detalle).toHaveBeenCalledTimes(2);
    expect(texto(elemento)).toContain('Le avisamos a camila@correo.test');
  });

  it('**despachado pide el número de Starken** antes de mandar', async () => {
    const { elemento, api, estable, apretar } = await montar({ ...PEDIDO, entrega: 'DESPACHO' });

    const boton = Array.from(elemento.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Marcar despachado'),
    )!;
    expect(boton.disabled).toBe(true);

    const seguimiento = elemento.querySelector<HTMLInputElement>('[name="numeroSeguimiento"]')!;
    seguimiento.value = 'STK-123456';
    seguimiento.dispatchEvent(new Event('input'));
    await estable();
    await apretar('Marcar despachado');

    expect(api.accion).toHaveBeenCalledWith(12, 'despachado', { numeroSeguimiento: 'STK-123456' });
  });

  it('si la API no lo deja (409), muestra su mensaje', async () => {
    const { elemento, apretar } = await montar(PEDIDO, () =>
      Promise.reject(
        new HttpErrorResponse({
          status: 409,
          error: {
            message: 'Solo un pedido pagado con retiro en el club se marca listo para retirar.',
          },
        }),
      ),
    );

    await apretar('Marcar listo para retirar');

    expect(texto(elemento)).toContain('Solo un pedido pagado con retiro');
  });

  it('las marcas a la vista: requiere revisión', async () => {
    const { elemento } = await montar({ ...PEDIDO, requiereRevision: true });

    expect(texto(elemento)).toContain('Requiere revisión');
  });
});
