import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DevolucionesDelPedido } from './devoluciones';
import { DetalleDePedido, PedidosDeLaTiendaAdmin } from './pedidos.service';

/**
 * T174. Cancelar y devolver desde el detalle del pedido: cancelar anula en Webpay, y **si
 * Webpay no deja, el panel lo dice y ofrece devolver por transferencia**. Una devolución
 * parcial elige las unidades, el monto —hasta lo pagado por ellas—, el medio y si vuelve
 * a la venta.
 */
describe('DevolucionesDelPedido', () => {
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
    totalClp: 269980,
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
        cantidadDevuelta: 0,
      },
      {
        id: 2,
        descripcion: 'Tubo de pelotas · Tubo',
        cantidad: 2,
        precioUnitarioClp: 9995,
        descuentoUnitarioClp: 0,
        esEncargo: false,
        cantidadDevuelta: 0,
      },
    ],
    devoluciones: [],
  };

  const montar = async (pedido: DetalleDePedido) => {
    const api = {
      cancelar: vi.fn().mockResolvedValue(undefined),
      devolver: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: PedidosDeLaTiendaAdmin, useValue: api }],
    });
    const fixture = TestBed.createComponent(DevolucionesDelPedido);
    fixture.componentRef.setInput('pedido', pedido);
    const cambios: unknown[] = [];
    fixture.componentInstance.cambio.subscribe(() => cambios.push(true));
    const elemento = fixture.nativeElement as HTMLElement;
    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await estable();

    const boton = (texto: string) =>
      Array.from(elemento.querySelectorAll('button')).find((b) => b.textContent?.includes(texto));
    const apretar = async (texto: string) => {
      boton(texto)!.click();
      await estable();
    };
    const escribir = async (selector: string, valor: string) => {
      const campo = elemento.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
      await estable();
    };

    return { elemento, api, cambios, boton, apretar, escribir, estable };
  };

  const texto = (elemento: HTMLElement) => (elemento.textContent ?? '').replace(/\s+/g, ' ');

  describe('cancelar', () => {
    it('**anula en Webpay con el motivo**, avisa y pide recargar el pedido', async () => {
      const { elemento, api, cambios, apretar, escribir } = await montar(PEDIDO);

      await escribir('[name="motivoCancelacion"]', 'Se arrepintió');
      await apretar('Cancelar y anular en Webpay');

      expect(api.cancelar).toHaveBeenCalledWith(12, {
        motivo: 'Se arrepintió',
        medio: 'WEBPAY',
      });
      expect(cambios).toHaveLength(1);
      expect(texto(elemento)).toContain('Pedido cancelado');
      expect(texto(elemento)).toContain('camila@correo.test');
    });

    it('sin motivo no se manda', async () => {
      const { elemento, api, apretar } = await montar(PEDIDO);

      await apretar('Cancelar y anular en Webpay');

      expect(api.cancelar).not.toHaveBeenCalled();
      expect(texto(elemento)).toContain('Escribe el motivo');
    });

    it('**si Webpay no deja anular, lo dice y ofrece devolver por transferencia**', async () => {
      const { elemento, api, boton, apretar, escribir } = await montar(PEDIDO);
      api.cancelar.mockRejectedValueOnce(
        new HttpErrorResponse({
          status: 502,
          error: { message: 'Webpay no dejó anular el pago.' },
        }),
      );
      expect(boton('Cancelar y devolver por transferencia')).toBeUndefined();

      await escribir('[name="motivoCancelacion"]', 'Se arrepintió');
      await apretar('Cancelar y anular en Webpay');
      expect(texto(elemento)).toContain('Webpay no dejó anular el pago.');

      await apretar('Cancelar y devolver por transferencia');
      expect(api.cancelar).toHaveBeenLastCalledWith(12, {
        motivo: 'Se arrepintió',
        medio: 'TRANSFERENCIA',
      });
    });

    it.each([
      ['entregado', { estado: 'ENTREGADO' }],
      ['despachado', { estado: 'DESPACHADO', entrega: 'DESPACHO' }],
      ['del mesón', { canal: 'MESON', estado: 'ENTREGADO', entrega: 'EN_MESON' }],
      [
        'con una devolución ya registrada',
        {
          devoluciones: [
            {
              id: 1,
              montoClp: 9995,
              medio: 'EFECTIVO',
              reponeStock: true,
              motivo: 'Retracto',
              creadaEn: '2026-10-13T12:00:00.000Z',
            },
          ],
        },
      ],
    ] as const)('%s: no se ofrece cancelar', async (_caso, datos) => {
      const { boton } = await montar({ ...PEDIDO, ...datos } as DetalleDePedido);

      expect(boton('Cancelar y anular en Webpay')).toBeUndefined();
      expect(boton('Registrar la devolución')).toBeDefined();
    });
  });

  describe('devolver una parte', () => {
    it('**manda las unidades, el monto, el medio, si repone stock y el motivo**', async () => {
      const { elemento, api, cambios, apretar, escribir } = await montar({
        ...PEDIDO,
        estado: 'ENTREGADO',
      });

      await escribir('[name="unidades-2"]', '1');
      expect(texto(elemento)).toContain('Hasta $9.995');
      await escribir('[name="montoDevolucion"]', '9995');
      (
        elemento.querySelector('[name="medioDevolucion"][value="EFECTIVO"]') as HTMLInputElement
      ).click();
      (elemento.querySelector('[name="reponeStock"]') as HTMLInputElement).click();
      await escribir('[name="motivoDevolucion"]', 'Retracto de un tubo');
      await apretar('Registrar la devolución');

      expect(api.devolver).toHaveBeenCalledWith(12, {
        lineas: [{ lineaId: 2, cantidad: 1 }],
        montoClp: 9995,
        medio: 'EFECTIVO',
        reponeStock: false,
        motivo: 'Retracto de un tubo',
      });
      expect(cambios).toHaveLength(1);
      expect(texto(elemento)).toContain('Devolución registrada');
    });

    it('sin unidades elegidas no se manda', async () => {
      const { elemento, api, apretar, escribir } = await montar(PEDIDO);

      await escribir('[name="montoDevolucion"]', '9995');
      await escribir('[name="motivoDevolucion"]', 'Retracto');
      await apretar('Registrar la devolución');

      expect(api.devolver).not.toHaveBeenCalled();
      expect(texto(elemento)).toContain('Elige qué unidades se devuelven');
    });

    it('**una línea ya devuelta entera no se ofrece**, y la otra dice cuántas quedan', async () => {
      const { elemento } = await montar({
        ...PEDIDO,
        lineas: [
          { ...PEDIDO.lineas[0], cantidadDevuelta: 1 },
          { ...PEDIDO.lineas[1], cantidadDevuelta: 1 },
        ],
      });

      expect(elemento.querySelector('[name="unidades-1"]')).toBeNull();
      expect(elemento.querySelector<HTMLInputElement>('[name="unidades-2"]')?.max).toBe('1');
    });

    it('las devoluciones registradas se listan con su monto, su medio y su motivo', async () => {
      const { elemento } = await montar({
        ...PEDIDO,
        estado: 'CANCELADO',
        devoluciones: [
          {
            id: 1,
            montoClp: 269980,
            medio: 'WEBPAY',
            reponeStock: true,
            motivo: 'Se arrepintió',
            creadaEn: '2026-10-13T12:00:00.000Z',
          },
        ],
      });

      expect(texto(elemento)).toContain('$269.980');
      expect(texto(elemento)).toContain('Anulado en Webpay');
      expect(texto(elemento)).toContain('Se arrepintió');
      // Cancelado: ya no hay nada más que devolver ni cancelar.
      expect(elemento.querySelector('form')).toBeNull();
    });
  });
});
