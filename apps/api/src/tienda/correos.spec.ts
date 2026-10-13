import type { DatosDelClub } from '../comun/club';
import {
  avisoAlClub,
  avisoDeStockBajo,
  compraConfirmada,
  despachado,
  listoParaRetirar,
  PedidoParaCorreo,
  recordatorioDeRetiro,
} from './correos';

/**
 * T165: los correos de una compra pagada.
 *
 * **El del comprador lleva las condiciones de venta**: la ley obliga a confirmarlas por
 * escrito, y si el correo no las trae el plazo de retracto se extiende a 90 días
 * (`SPEC-tienda.md` § Legal). Por eso se prueban acá, línea por línea.
 */
describe('Los correos de la tienda', () => {
  const CLUB: DatosDelClub = {
    nombre: 'FEDAL Tennis Center',
    direccion: 'Av. Siempre Viva 123, Temuco',
    telefono: '56452123456',
    email: 'contacto@fedal.cl',
    latitud: null,
    longitud: null,
  };
  const ORIGEN = 'https://fedal.cl';

  const PEDIDO: PedidoParaCorreo = {
    id: 12,
    token: '7d1c2a9e-0000-4000-8000-000000000012',
    nombre: 'Camila Rojas',
    entrega: 'RETIRO',
    region: null,
    comuna: null,
    direccion: null,
    referencia: null,
    totalClp: 263970,
    descuentoSocioClp: 0,
    documento: 'VOUCHER',
    facturaRazonSocial: null,
    lineas: [
      {
        descripcion: 'Babolat Pure Drive · Grip 2',
        cantidad: 1,
        precioUnitarioClp: 249990,
        descuentoUnitarioClp: 0,
      },
      {
        descripcion: 'Head Tour · Única',
        cantidad: 2,
        precioUnitarioClp: 6990,
        descuentoUnitarioClp: 0,
      },
    ],
  };

  describe('al comprador', () => {
    it('el detalle, el total y el enlace para seguir el pedido', () => {
      const { asunto, cuerpo } = compraConfirmada(PEDIDO, CLUB, ORIGEN);

      expect(asunto).toBe('Compra confirmada: pedido N.º 12');
      expect(cuerpo).toContain('Hola Camila Rojas:');
      expect(cuerpo).toContain('1 × Babolat Pure Drive · Grip 2: $249.990');
      expect(cuerpo).toContain('2 × Head Tour · Única: $13.980');
      expect(cuerpo).toContain('Total pagado: $263.970');
      expect(cuerpo).toContain(`${ORIGEN}/tienda/pedido/${PEDIDO.token}`);
      expect(cuerpo).toContain('FEDAL Tennis Center');
    });

    it('**las condiciones de venta**: garantía legal, retracto y los términos completos', () => {
      const { cuerpo } = compraConfirmada(PEDIDO, CLUB, ORIGEN);

      expect(cuerpo).toContain('Condiciones de venta');
      expect(cuerpo).toContain('Garantía legal: seis meses');
      expect(cuerpo).toContain('Derecho a retracto: 10 días');
      expect(cuerpo).toContain(`${ORIGEN}/tienda/terminos`);
    });

    it('con retiro, que se le avisa cuando esté listo', () => {
      const { cuerpo } = compraConfirmada(PEDIDO, CLUB, ORIGEN);

      expect(cuerpo).toContain('Retiro en el club');
      expect(cuerpo).toContain('te avisamos por correo cuando esté listo');
    });

    it('con despacho, la dirección y que el despacho es por pagar', () => {
      const { cuerpo } = compraConfirmada(
        {
          ...PEDIDO,
          entrega: 'DESPACHO',
          region: 'Metropolitana de Santiago',
          comuna: 'Ñuñoa',
          direccion: 'Av. Irarrázaval 1234',
          referencia: 'Timbre malo',
        },
        CLUB,
        ORIGEN,
      );

      expect(cuerpo).toContain(
        'Despacho a Av. Irarrázaval 1234, Ñuñoa, Metropolitana de Santiago (Timbre malo)',
      );
      expect(cuerpo).toContain('por pagar');
    });

    it('con descuento de socio, cuánto se descontó y el precio de cada línea ya rebajado', () => {
      const { cuerpo } = compraConfirmada(
        {
          ...PEDIDO,
          totalClp: 17823,
          descuentoSocioClp: 3147,
          lineas: [
            {
              descripcion: 'Head Tour · Única',
              cantidad: 3,
              precioUnitarioClp: 6990,
              descuentoUnitarioClp: 1049,
            },
          ],
        },
        CLUB,
        ORIGEN,
      );

      expect(cuerpo).toContain('3 × Head Tour · Única: $17.823');
      expect(cuerpo).toContain('Descuento de socio: −$3.147');
    });

    it('el documento: el comprobante de Webpay vale como boleta; la factura, a nombre de quién', () => {
      expect(compraConfirmada(PEDIDO, CLUB, ORIGEN).cuerpo).toContain(
        'El comprobante de Webpay vale como boleta',
      );
      expect(
        compraConfirmada(
          {
            ...PEDIDO,
            documento: 'FACTURA',
            facturaRazonSocial: 'Comercial Los Aromos SpA',
          },
          CLUB,
          ORIGEN,
        ).cuerpo,
      ).toContain('factura a nombre de Comercial Los Aromos SpA');
    });
  });

  describe('al club', () => {
    it('pedido nuevo, con su enlace en el panel', () => {
      const { asunto, cuerpo } = avisoAlClub(PEDIDO, null, CLUB, ORIGEN);

      expect(asunto).toBe('Pedido nuevo N.º 12: $263.970');
      expect(cuerpo).toContain('Retiro en el club');
      expect(cuerpo).toContain(`${ORIGEN}/administracion/tienda/pedidos/12`);
    });

    it('**en revisión, lo dice en el asunto y explica por qué**', () => {
      const { asunto, cuerpo } = avisoAlClub(
        PEDIDO,
        'El pago llegó con Babolat Pure Drive · Grip 2 ya vendido: el stock quedó en −1.',
        CLUB,
        ORIGEN,
      );

      expect(asunto).toBe('Pedido en revisión N.º 12: $263.970');
      expect(cuerpo).toContain('el stock quedó en −1');
    });
  });

  describe('los avisos del pedido (T169)', () => {
    it('**listo para retirar**: dónde, en qué horario y el enlace al pedido', () => {
      const { asunto, cuerpo } = listoParaRetirar(
        PEDIDO,
        'Lunes a sábado de 9:00 a 20:00',
        CLUB,
        ORIGEN,
      );

      expect(asunto).toBe('Tu pedido N.º 12 está listo para retirar');
      expect(cuerpo).toContain('Av. Siempre Viva 123, Temuco');
      expect(cuerpo).toContain('Lunes a sábado de 9:00 a 20:00');
      expect(cuerpo).toContain(`${ORIGEN}/tienda/pedido/${PEDIDO.token}`);
    });

    it('sin horario cargado, no inventa uno', () => {
      const { cuerpo } = listoParaRetirar(PEDIDO, '', CLUB, ORIGEN);

      expect(cuerpo).not.toContain('Horario');
    });

    it('**despachado**: la empresa y el número de seguimiento, y que es por pagar', () => {
      const { asunto, cuerpo } = despachado(
        { ...PEDIDO, entrega: 'DESPACHO', numeroSeguimiento: 'STK-123456' },
        CLUB,
        ORIGEN,
      );

      expect(asunto).toBe('Tu pedido N.º 12 va en camino');
      expect(cuerpo).toContain('Starken');
      expect(cuerpo).toContain('STK-123456');
      expect(cuerpo).toContain('por pagar');
    });
  });

  describe('el recordatorio de retiro (T171)', () => {
    it('**que el pedido sigue esperando**, dónde, en qué horario y el enlace', () => {
      const { asunto, cuerpo } = recordatorioDeRetiro(
        PEDIDO,
        'Lunes a sábado de 9:00 a 20:00',
        CLUB,
        ORIGEN,
      );

      expect(asunto).toBe('Tu pedido N.º 12 te espera en el club');
      expect(cuerpo).toContain('Av. Siempre Viva 123, Temuco');
      expect(cuerpo).toContain('Lunes a sábado de 9:00 a 20:00');
      expect(cuerpo).toContain(`${ORIGEN}/tienda/pedido/${PEDIDO.token}`);
    });
  });

  describe('el aviso de stock bajo (T173)', () => {
    it('**varias variantes de un pedido van en un solo correo**, cada una con su enlace', () => {
      const { asunto, cuerpo } = avisoDeStockBajo(
        [
          {
            etiqueta: 'Grip 2',
            stock: 2,
            producto: { id: 7, nombre: 'Pure Drive' },
          },
          {
            etiqueta: '42',
            stock: -1,
            producto: { id: 9, nombre: 'Gel Resolution' },
          },
        ],
        2,
        CLUB,
        ORIGEN,
      );

      expect(asunto).toBe('Stock bajo en 2 variantes');
      expect(cuerpo).toContain('umbral de stock bajo (2)');
      expect(cuerpo).toContain('Pure Drive · Grip 2: 2 en stock');
      expect(cuerpo).toContain('Gel Resolution · 42: −1 en stock');
      expect(cuerpo).toContain(`${ORIGEN}/administracion/tienda/productos/9`);
    });
  });
});
