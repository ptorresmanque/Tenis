import {
  comoFechaCivil,
  fechaDelClub,
  hoyEnElClub,
  instanteEnElClub,
} from '../comun/tiempo';

/** Desde y hasta qué hora del reloj del club corre el plazo de una oferta (E7). */
const DESDE = '08:00';
const HASTA = '22:00';

/** El día civil siguiente, "AAAA-MM-DD". */
const diaSiguiente = (fecha: string) =>
  comoFechaCivil(new Date(fechaDelClub(fecha).getTime() + 86_400_000));

/**
 * Hasta cuándo se le guarda el cupo a quien recibe la oferta de la lista de espera (T325,
 * SPEC-torneos.md § Lista de espera sin cobro, E1, E3 y E7).
 *
 * **El plazo corre solo de día**, de 8:00 a 22:00 en el reloj del club: el correo sale a
 * cualquier hora, pero de noche no se descuenta. Con 30 minutos y sin esto, un cupo que se abre a
 * las 23:00 recorrería la fila entera mientras la gente duerme.
 *
 * **Nunca pasa del fin del último día de inscripción**, que es hasta cuando la API la acepta.
 *
 * Cada tramo se suma en el día de su reloj, con `instanteEnElClub`: el domingo que Chile cambia la
 * hora, las 8:00 de ese día son otro instante UTC que las del sábado.
 */
export function vencimientoDeLaOferta(
  desde: Date,
  plazoMin: number,
  cierreInscripcion: Date,
): Date {
  const tope = instanteEnElClub(
    diaSiguiente(comoFechaCivil(cierreInscripcion)),
    '00:00',
  );
  let fecha = comoFechaCivil(hoyEnElClub(desde));
  let cursor = desde;
  let faltan = plazoMin;

  while (cursor < tope) {
    const abre = instanteEnElClub(fecha, DESDE);
    const cierra = instanteEnElClub(fecha, HASTA);
    if (cursor < abre) cursor = abre;

    const quedanHoy = Math.max(
      0,
      (cierra.getTime() - cursor.getTime()) / 60_000,
    );
    if (faltan <= quedanHoy) {
      const vence = new Date(cursor.getTime() + faltan * 60_000);
      return vence < tope ? vence : tope;
    }

    faltan -= quedanHoy;
    fecha = diaSiguiente(fecha);
    cursor = instanteEnElClub(fecha, DESDE);
  }

  return tope;
}
