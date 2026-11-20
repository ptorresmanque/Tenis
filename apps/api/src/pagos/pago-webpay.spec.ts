import {
  ConceptoPago,
  EstadoTransaccion,
  type Transaccion,
} from '../generated/prisma/client';
import { pagoWebpay } from './pago-webpay';

/**
 * T387. Lo que el panel ve de un pago por Webpay. La lista de campos es explícita para que
 * una columna nueva de `transaccion` no salga sola, y sobre todo el token de la pasarela,
 * que sirve para consultar y anular el cobro.
 */
describe('pagoWebpay', () => {
  const FILA: Transaccion = {
    id: 7,
    referencia: 'R-2037-0007',
    concepto: ConceptoPago.RESERVA,
    conceptoId: 42,
    usuarioId: null,
    inicioBloqueOriginal: new Date('2037-09-14T21:00:00.000Z'),
    montoClp: 12000,
    estado: EstadoTransaccion.AUTORIZADA,
    pasarela: 'webpay',
    tokenPasarela: 'token-secreto-de-la-pasarela',
    codigoAutorizacion: '1213',
    ultimosDigitos: '6623',
    requiereRevision: false,
    creadaEn: new Date('2037-09-01T15:00:00.000Z'),
    confirmadaEn: new Date('2037-09-01T15:02:00.000Z'),
  };

  it('**dice lo que respondió Webpay**: orden de compra, monto, estado, autorización y tarjeta', () => {
    expect(pagoWebpay(FILA)).toEqual({
      id: 7,
      referencia: 'R-2037-0007',
      montoClp: 12000,
      estado: EstadoTransaccion.AUTORIZADA,
      pasarela: 'webpay',
      codigoAutorizacion: '1213',
      ultimosDigitos: '6623',
      creadaEn: new Date('2037-09-01T15:00:00.000Z'),
      confirmadaEn: new Date('2037-09-01T15:02:00.000Z'),
      requiereRevision: false,
    });
  });

  it('**nunca lleva el token de la pasarela**', () => {
    expect(JSON.stringify(pagoWebpay(FILA))).not.toContain(
      'token-secreto-de-la-pasarela',
    );
  });
});
