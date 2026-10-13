import { entero } from '../catalogo-canchas/admin.dto';

/**
 * Un cuadro nuevo: qué categoría de juego se corre, con cuántos y cuánto cuesta.
 *
 * **Cuánto vale ganarlo ya no es del cuadro** (T199): lo dice el nivel con que el torneo
 * entró a cada tour.
 */
export interface CuadroNuevo {
  categoriaJuegoId: number;
  cupo: number;
  montoInscripcionClp: number;
}

/**
 * El cupo de un cuadro, con el mismo rango que tenía el del torneo.
 *
 * Sin tope de potencia de dos: el cuadro se redondea hacia arriba con byes, y exigirlo
 * obligaría al club a saber de potencias de dos para inscribir.
 */
const cupoDelCuadro = (valor: unknown) => entero(valor, 'El cupo', 2, 256);

/**
 * Lo que cuesta inscribirse. Cero es gratis y es el valor por omisión.
 *
 * El tope es un techo contra el dedazo, no una regla del club: una inscripción de diez
 * millones es un cero de más, y con este 400 se entera quien lo escribió en vez del
 * jugador al llegar a Webpay.
 */
const montoDelCuadro = (valor: unknown) =>
  entero(valor, 'El monto de la inscripción', 0, 10_000_000);

export function leerCuadroNuevo(cuerpo: unknown): CuadroNuevo {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    categoriaJuegoId: entero(datos.categoriaJuegoId, 'La categoría', 1),
    cupo: cupoDelCuadro(datos.cupo),
    montoInscripcionClp:
      datos.montoInscripcionClp === undefined
        ? 0
        : montoDelCuadro(datos.montoInscripcionClp),
  };
}

/**
 * Lo que se le puede cambiar a un cuadro ya armado.
 *
 * **La categoría de juego no está**, y es deliberado: cambiarla movería a los inscritos
 * a un nivel al que no se anotaron. Se quita el cuadro y se arma otro, que además
 * obliga a pasar por la comprobación de que no haya nadie dentro.
 */
export function leerCambioDeCuadro(
  cuerpo: unknown,
): Partial<Omit<CuadroNuevo, 'categoriaJuegoId'>> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<Omit<CuadroNuevo, 'categoriaJuegoId'>> = {};

  if (datos.cupo !== undefined) cambio.cupo = cupoDelCuadro(datos.cupo);
  if (datos.montoInscripcionClp !== undefined) {
    cambio.montoInscripcionClp = montoDelCuadro(datos.montoInscripcionClp);
  }

  return cambio;
}
