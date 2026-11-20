import { fechaEnElClub, horaEnElClub } from '../catalogo-canchas/reloj-del-club';
import { EstadoDelPago, FilaDePago, MedioDelPago } from './pagos.service';

/**
 * Cómo dice el club cada cosa de un pago: la lista (T398) y la ficha (T399) lo dicen igual. Los
 * íconos están en la fuente recortada del sitio (`iconos-en-uso.txt`).
 */

/** El estado (asunción 5), con su ícono y su color: no solo el color. */
export const ESTADO_DEL_PAGO: Record<
  EstadoDelPago,
  { palabra: string; icono: string; variante: string }
> = {
  AUTORIZADA: { palabra: 'Autorizado', icono: 'check_circle', variante: 'exito' },
  PENDIENTE: { palabra: 'Pendiente', icono: 'schedule', variante: 'aviso' },
  RECHAZADA: { palabra: 'Rechazado', icono: 'cancel', variante: 'error' },
  ANULADA: { palabra: 'Devuelto', icono: 'money_off', variante: 'neutro' },
  EXPIRADA: { palabra: 'Expirado', icono: 'timer_off', variante: 'neutro' },
  MESON: { palabra: 'Pagado en el mesón', icono: 'payments', variante: 'exito' },
};

export const MEDIO_DEL_PAGO: Record<MedioDelPago, string> = {
  WEBPAY: 'Webpay',
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
};

/** Los tipos de pago de Webpay, en minúscula para ir después del medio: «Webpay · débito». */
export const TIPO_DE_PAGO: Record<string, string> = {
  VD: 'débito',
  VN: 'crédito',
  VC: 'crédito en cuotas',
  SI: 'cuotas sin interés',
  S2: 'cuotas sin interés',
  NC: 'cuotas sin interés',
  VP: 'prepago',
};

/** «Webpay · débito», «Efectivo» o «Transferencia». */
export function medioDelPago({ medio, tipoPago }: FilaDePago): string {
  const tipo = tipoPago ? (TIPO_DE_PAGO[tipoPago] ?? tipoPago) : null;
  return tipo ? `${MEDIO_DEL_PAGO[medio]} · ${tipo}` : MEDIO_DEL_PAGO[medio];
}

/** «05-02-2039 12:00», en la hora del club. */
export function fechaYHoraDelClub(instante: string): string {
  const [anio, mes, dia] = fechaEnElClub(instante).split('-');
  return `${dia}-${mes}-${anio} ${horaEnElClub(instante)}`;
}
