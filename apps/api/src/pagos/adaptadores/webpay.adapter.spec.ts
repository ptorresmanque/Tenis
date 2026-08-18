import { TransaccionWebpay, WebpayAdapter } from './webpay.adapter';

/**
 * T17. El adaptador de Webpay Plus.
 *
 * Acá se prueba la traducción: lo que responde Transbank contra lo que entiende el
 * resto del sistema. El ciclo real contra el ambiente de integración se verifica a
 * mano —no se puede automatizar sin tipear una tarjeta en el formulario de Webpay—,
 * así que estos tests fijan las respuestas que ese ambiente devuelve de verdad.
 */
describe('WebpayAdapter', () => {
  let webpay: jest.Mocked<TransaccionWebpay>;
  let adaptador: WebpayAdapter;

  const orden = {
    referencia: 'a1b2c3d4e5f6a1b2c3d4e5f6ab',
    montoClp: 12000,
    urlRetorno: 'https://club.local/pagos/retorno',
  };

  /** Una respuesta de `commit` como la que devuelve Webpay Plus al autorizar. */
  const autorizada = {
    buy_order: orden.referencia,
    status: 'AUTHORIZED',
    amount: 12000,
    authorization_code: '123456',
    response_code: 0,
    payment_type_code: 'VN',
    card_detail: { card_number: '6623' },
  };

  beforeEach(() => {
    webpay = {
      create: jest.fn(),
      commit: jest.fn(),
      refund: jest.fn(),
    };
    adaptador = new WebpayAdapter(webpay);
  });

  describe('iniciar', () => {
    it('manda la referencia como orden de compra y devuelve token y URL', async () => {
      webpay.create.mockResolvedValue({
        token: 'tok-01',
        url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction',
      });

      const inicio = await adaptador.iniciar(orden);

      expect(webpay.create).toHaveBeenCalledWith(
        orden.referencia,
        expect.any(String),
        12000,
        orden.urlRetorno,
      );
      expect(inicio).toEqual({
        tokenPasarela: 'tok-01',
        urlRedireccion:
          'https://webpay3gint.transbank.cl/webpayserver/initTransaction',
      });
    });

    it('no inventa un token si Webpay no lo manda', async () => {
      // Sin token no hay forma de reconocer la transacción cuando vuelva el callback.
      // Guardarlo como nulo dejaría un cobro iniciado en Transbank que acá figura
      // como pendiente para siempre.
      webpay.create.mockResolvedValue({
        url: 'https://webpay3gint.transbank.cl',
      });

      await expect(adaptador.iniciar(orden)).rejects.toThrow(/token/i);
    });

    it('rechaza una referencia más larga de lo que Webpay acepta, sin llamar', async () => {
      // 26 caracteres es el máximo de `buyOrder`. Un UUID con guiones mide 36: sin
      // este límite, el primer pago real muere con un error de validación del SDK y
      // parece un problema de Transbank.
      await expect(
        adaptador.iniciar({ ...orden, referencia: 'x'.repeat(27) }),
      ).rejects.toThrow(/26/);

      expect(webpay.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmar', () => {
    it('traduce una autorización, con código y últimos dígitos', async () => {
      webpay.commit.mockResolvedValue(autorizada);

      expect(await adaptador.confirmar('tok-01')).toEqual({
        estado: 'AUTORIZADA',
        codigoAutorizacion: '123456',
        montoClp: 12000,
        ultimosDigitos: '6623',
        motivoRechazo: null,
      });
    });

    it('el monto que reporta Transbank se pasa tal cual, sin corregirlo', async () => {
      // Es el insumo del criterio 6 del spec: T18 lo compara contra lo guardado y, si
      // no coincide, no confirma el efecto de negocio. Si el adaptador devolviera el
      // monto que pedimos en vez del que Transbank dice, esa comparación no serviría
      // de nada porque siempre coincidiría.
      webpay.commit.mockResolvedValue({ ...autorizada, amount: 999 });

      expect((await adaptador.confirmar('tok-01')).montoClp).toBe(999);
    });

    it('traduce un rechazo del emisor a un motivo legible', async () => {
      webpay.commit.mockResolvedValue({
        ...autorizada,
        status: 'FAILED',
        response_code: -1,
        authorization_code: null,
      });

      const resultado = await adaptador.confirmar('tok-01');

      expect(resultado.estado).toBe('RECHAZADA');
      expect(resultado.codigoAutorizacion).toBeNull();
      // Un "-1" en pantalla no le dice nada a quien intentó pagar.
      expect(resultado.motivoRechazo).toMatch(/rechaz/i);
      expect(resultado.motivoRechazo).not.toMatch(/^-?\d+$/);
    });

    it('un código de respuesta desconocido igual se explica y se rechaza', async () => {
      webpay.commit.mockResolvedValue({
        ...autorizada,
        status: 'FAILED',
        response_code: -99,
      });

      const resultado = await adaptador.confirmar('tok-01');

      expect(resultado.estado).toBe('RECHAZADA');
      expect(resultado.motivoRechazo).toContain('-99');
    });

    it('no da por autorizado un estado que Transbank no llamó AUTHORIZED', async () => {
      // `response_code: 0` con otro estado pasa en las transacciones anuladas o
      // capturadas a medias. Mirar solo el código dejaría una reserva confirmada
      // sobre un cobro que no está en pie.
      webpay.commit.mockResolvedValue({ ...autorizada, status: 'NULLIFIED' });

      expect((await adaptador.confirmar('tok-01')).estado).toBe('RECHAZADA');
    });

    it('se queda con los últimos cuatro dígitos, venga como venga', async () => {
      // La documentación del SDK muestra `card_number: '****1111'` y la API REST
      // manda solo los cuatro dígitos. La columna es VARCHAR(4): guardar la versión
      // enmascarada revienta el insert **justo al confirmar un pago real**, que es el
      // peor momento posible para descubrirlo.
      webpay.commit.mockResolvedValue({
        ...autorizada,
        card_detail: { card_number: '****1111' },
      });

      expect((await adaptador.confirmar('tok-01')).ultimosDigitos).toBe('1111');
    });

    it('sin tarjeta en la respuesta, los últimos dígitos son nulos', async () => {
      const { card_detail: _, ...sinTarjeta } = autorizada;
      webpay.commit.mockResolvedValue(sinTarjeta);

      expect((await adaptador.confirmar('tok-01')).ultimosDigitos).toBeNull();
    });

    it('no da por bueno un commit sin monto', async () => {
      // El monto de Transbank es el insumo de la comparación de T18. Si llegara
      // `undefined` —respuesta cambiada, error de red mal manejado— la comparación
      // sería contra nada y el efecto de negocio se confirmaría a ciegas.
      const { amount: _, ...sinMonto } = autorizada;
      webpay.commit.mockResolvedValue(sinMonto);

      await expect(adaptador.confirmar('tok-01')).rejects.toThrow(/monto/i);
    });

    it('lee los últimos dígitos aunque vengan en la raíz', async () => {
      // La API REST los manda en `card_detail`; la referencia del SDK los documenta
      // en la raíz. Se aceptan los dos: perderlos deja el comprobante sin la única
      // pista de con qué tarjeta se pagó.
      const { card_detail: _, ...sinDetalle } = autorizada;
      webpay.commit.mockResolvedValue({ ...sinDetalle, card_number: '6623' });

      expect((await adaptador.confirmar('tok-01')).ultimosDigitos).toBe('6623');
    });
  });

  describe('anular', () => {
    it('pide la devolución del monto a Transbank', async () => {
      webpay.refund.mockResolvedValue({ type: 'REVERSED' });

      await adaptador.anular('tok-01', 12000);

      expect(webpay.refund).toHaveBeenCalledWith('tok-01', 12000);
    });

    it('propaga la falla: una devolución que no ocurrió no se puede dar por hecha', async () => {
      webpay.refund.mockRejectedValue(new Error('Transaction not found'));

      await expect(adaptador.anular('tok-01', 12000)).rejects.toThrow();
    });
  });
});
