/**
 * El RUT de una factura (T164), en la forma en que se guarda: `76123456-0`, sin puntos,
 * con guion y la K en mayúscula. Nulo si no es un RUT: el dígito verificador tiene que
 * cuadrar (módulo 11), porque una factura a un RUT con un dígito cambiado es una factura
 * a otra empresa.
 */
export function normalizarRut(valor: string): string | null {
  const limpio = valor.replace(/[.\s-]/g, '').toUpperCase();
  const partes = /^(\d{1,9})([\dK])$/.exec(limpio);
  if (!partes) return null;

  const [, cuerpo, digito] = partes;

  return digitoVerificador(cuerpo) === digito ? `${cuerpo}-${digito}` : null;
}

function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;

  for (const cifra of [...cuerpo].reverse()) {
    suma += Number(cifra) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const resto = 11 - (suma % 11);

  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}
