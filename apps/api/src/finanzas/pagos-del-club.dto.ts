import { BadRequestException } from '@nestjs/common';

import { comoFechaCivil, esFechaDelClub, hoyEnElClub } from '../comun/tiempo';
import { EstadoTransaccion } from '../generated/prisma/client';
import type {
  ConceptoDelPago,
  EstadoDelPago,
  FiltroDePagos,
  MedioDelPago,
  OrigenDelPago,
} from './pagos-del-club.service';

/**
 * Lo que llega a Finanzas › Pagos por la consulta y el cuerpo, leído y validado antes de tocar el
 * servicio (T396–T397). Lo que no existe responde 400.
 */

const CONCEPTOS: ConceptoDelPago[] = ['RESERVA', 'CUOTA', 'INSCRIPCION'];
const ESTADOS: EstadoDelPago[] = [...Object.values(EstadoTransaccion), 'MESON'];
const MEDIOS: MedioDelPago[] = ['WEBPAY', 'EFECTIVO', 'TRANSFERENCIA'];
const ORIGENES: OrigenDelPago[] = ['webpay', 'cuota', 'inscripcion'];

/**
 * Lee el filtro de la consulta, con los valores por omisión a la vista (el mes en curso). Un valor
 * que no existe responde 400: una lista vacía parecería la verdad.
 */
export function leerFiltro(consulta: Record<string, unknown>): FiltroDePagos {
  const hoy = comoFechaCivil(hoyEnElClub());
  const desde = texto(consulta['desde']) || `${hoy.slice(0, 7)}-01`;
  const hasta = texto(consulta['hasta']) || ultimoDiaDelMes(hoy);
  if (!esFechaDelClub(desde) || !esFechaDelClub(hasta) || desde > hasta) {
    throw new BadRequestException(
      'Las fechas tienen que existir, con la forma AAAA-MM-DD, y «desde» no puede ir después de «hasta».',
    );
  }

  const conceptos = valores(consulta['concepto']);
  const estado = texto(consulta['estado']) || null;
  const medio = texto(consulta['medio']) || null;
  const orden = texto(consulta['orden']) || 'fecha';
  const direccion = texto(consulta['direccion']) || 'desc';

  if (
    conceptos.some((uno) => !CONCEPTOS.includes(uno as ConceptoDelPago)) ||
    (estado !== null && !ESTADOS.includes(estado as EstadoDelPago)) ||
    (medio !== null && !MEDIOS.includes(medio as MedioDelPago)) ||
    !['fecha', 'monto'].includes(orden) ||
    !['asc', 'desc'].includes(direccion)
  ) {
    throw new BadRequestException('Ese filtro no existe.');
  }

  return {
    desde,
    hasta,
    conceptos: conceptos as ConceptoDelPago[],
    estado: estado as EstadoDelPago | null,
    medio: medio as MedioDelPago | null,
    q: texto(consulta['q']).slice(0, 100),
    porRevisar: texto(consulta['porRevisar']) === 'true',
    orden: orden as FiltroDePagos['orden'],
    direccion: direccion as FiltroDePagos['direccion'],
  };
}

export function leerPagina(valor: unknown): number {
  const pagina = valor === undefined ? 1 : Number(valor);
  if (!Number.isInteger(pagina) || pagina < 1) {
    throw new BadRequestException('La página es un número desde 1.');
  }
  return pagina;
}

export function leerOrigen(valor: string): OrigenDelPago {
  if (!ORIGENES.includes(valor as OrigenDelPago)) {
    throw new BadRequestException('Ese origen de pago no existe.');
  }
  return valor as OrigenDelPago;
}

/**
 * La nota de la revisión o el motivo de la devolución, del cuerpo: obligatorio y de hasta 200
 * caracteres, el largo de su columna.
 */
export function leerTextoObligatorio(
  cuerpo: unknown,
  campo: 'nota' | 'motivo',
): string {
  const valor =
    typeof cuerpo === 'object' && cuerpo !== null
      ? texto((cuerpo as Record<string, unknown>)[campo]).trim()
      : '';
  if (valor === '' || valor.length > 200) {
    throw new BadRequestException(
      campo === 'nota'
        ? 'La nota es obligatoria y tiene hasta 200 caracteres.'
        : 'El motivo es obligatorio y tiene hasta 200 caracteres.',
    );
  }
  return valor;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

/** `?concepto=A,B` y `?concepto=A&concepto=B` dicen lo mismo. */
function valores(valor: unknown): string[] {
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista
    .flatMap((uno) => texto(uno).split(','))
    .map((uno) => uno.trim())
    .filter(Boolean);
}

function ultimoDiaDelMes(fecha: string): string {
  const [anio, mes] = fecha.split('-').map(Number);
  return comoFechaCivil(new Date(Date.UTC(anio, mes, 0)));
}
