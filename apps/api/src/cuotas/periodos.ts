/**
 * El último día del mes de un período "AAAA-MM", como fecha civil a medianoche UTC.
 *
 * Con el día 0 del mes siguiente, que es como se pide el último del actual sin saber
 * si tiene 28, 29, 30 o 31. Sumar 30 días daría marzo para febrero.
 *
 * Compartido por los dos caminos de pago —el mesón y Webpay— porque los dos extienden
 * la misma vigencia: dos copias de este cálculo son dos oportunidades de que una diga
 * el 30 de febrero.
 */
export function ultimoDiaDelPeriodo(periodo: string): Date {
  const [anio, mes] = periodo.split('-').map(Number);

  return new Date(Date.UTC(anio, mes, 0));
}
