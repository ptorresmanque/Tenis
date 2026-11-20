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
  /** Lo que dijo Webpay al confirmar (T395). */
  tipoPago: string | null;
  numeroCuotas: number | null;
  codigoRespuesta: number | null;
  motivoRechazo: string | null;
  /** La revisión desde Finanzas › Pagos (T397). */
  revisadaPor: number | null;
  revisadaEn: Date | null;
  notaRevision: string | null;
  /** La devolución: cuándo y, si fue a mano, quién y por qué. */
  anuladaPor: number | null;
  anuladaEn: Date | null;
  motivoAnulacion: string | null;
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
  tipoPago: true,
  numeroCuotas: true,
  codigoRespuesta: true,
  motivoRechazo: true,
  revisadaPor: true,
  revisadaEn: true,
  notaRevision: true,
  anuladaPor: true,
  anuladaEn: true,
  motivoAnulacion: true,
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
    tipoPago: transaccion.tipoPago,
    numeroCuotas: transaccion.numeroCuotas,
    codigoRespuesta: transaccion.codigoRespuesta,
    motivoRechazo: transaccion.motivoRechazo,
    revisadaPor: transaccion.revisadaPor,
    revisadaEn: transaccion.revisadaEn,
    notaRevision: transaccion.notaRevision,
    anuladaPor: transaccion.anuladaPor,
    anuladaEn: transaccion.anuladaEn,
    motivoAnulacion: transaccion.motivoAnulacion,
  };
}
