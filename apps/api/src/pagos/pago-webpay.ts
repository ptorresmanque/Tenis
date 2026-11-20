import type {
  EstadoTransaccion,
  Transaccion,
} from '../generated/prisma/client';

/** Lo que el panel ve de un pago por Webpay: la respuesta de la pasarela y su estado. */
export interface PagoWebpay {
  id: number;
  /** La orden de compra que viajó a la pasarela. */
  referencia: string;
  montoClp: number;
  estado: EstadoTransaccion;
  pasarela: string;
  codigoAutorizacion: string | null;
  ultimosDigitos: string | null;
  creadaEn: Date;
  confirmadaEn: Date | null;
  requiereRevision: boolean;
}

/**
 * Las columnas que lee `pagoWebpay`, para el `select` de quien consulta: así el token de la
 * pasarela ni siquiera sale de la base (revisión, T394).
 */
export const CAMPOS_DEL_PAGO_WEBPAY = {
  id: true,
  referencia: true,
  montoClp: true,
  estado: true,
  pasarela: true,
  codigoAutorizacion: true,
  ultimosDigitos: true,
  creadaEn: true,
  confirmadaEn: true,
  requiereRevision: true,
} as const;

/**
 * Un pago, como lo ven la ficha de la reserva (T387) y Finanzas › Pagos.
 *
 * **Los campos van uno por uno y no con un spread**: una columna nueva de `transaccion` no
 * tiene que salir sola, y el token de la pasarela no sale nunca, porque con él se consulta y
 * se anula el cobro.
 */
export function pagoWebpay(
  transaccion: Pick<Transaccion, keyof typeof CAMPOS_DEL_PAGO_WEBPAY>,
): PagoWebpay {
  return {
    id: transaccion.id,
    referencia: transaccion.referencia,
    montoClp: transaccion.montoClp,
    estado: transaccion.estado,
    pasarela: transaccion.pasarela,
    codigoAutorizacion: transaccion.codigoAutorizacion,
    ultimosDigitos: transaccion.ultimosDigitos,
    creadaEn: transaccion.creadaEn,
    confirmadaEn: transaccion.confirmadaEn,
    requiereRevision: transaccion.requiereRevision,
  };
}
