import type { VarianteInsignia } from '../ui/insignia';
import type { EstadoPedido } from './tienda.service';

/** Cómo se lee cada estado, y con qué color. Lo comparten el pedido y "Mis pedidos" (T166). */
export const ESTADOS: Record<EstadoPedido, { texto: string; variante: VarianteInsignia }> = {
  PENDIENTE_PAGO: { texto: 'Esperando el pago', variante: 'aviso' },
  PAGADO: { texto: 'Pagado', variante: 'info' },
  LISTO_PARA_RETIRO: { texto: 'Listo para retirar', variante: 'exito' },
  DESPACHADO: { texto: 'Despachado', variante: 'info' },
  ENTREGADO: { texto: 'Entregado', variante: 'exito' },
  CANCELADO: { texto: 'Cancelado', variante: 'error' },
  EXPIRADO: { texto: 'No se pagó', variante: 'neutro' },
};

/** "12 de octubre de 2026", en la hora del club. */
export const FECHA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Santiago',
});
