import { entero } from '../catalogo-canchas/admin.dto';

/**
 * Un cuadro nuevo: qué categoría se corre, con cuántos, y **cuánto vale ganarlo**.
 *
 * Dos campos que se llaman parecido y no son lo mismo. `categoriaJuegoId` es el nivel
 * de quienes juegan —5ª, Honor—; `categoriaId` es la categoría de torneo, la que dice
 * si ganar esto vale 250 o 500 puntos (T70).
 */
export interface CuadroNuevo {
  categoriaJuegoId: number;
  categoriaId: number;
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
    categoriaId: entero(datos.categoriaId, 'La categoría del torneo', 1),
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
 *
 * **La de torneo sí se puede cambiar** (T70): es cuánto vale ganarlo, y el club puede
 * decidir que este año su Honor es un Máster sin tocar a nadie de la lista. Cambiarla
 * con el torneo terminado reescribe la tabla, que es lo que se quiere si se corrige un
 * error, y por eso el panel lo dice al lado del selector.
 */
export function leerCambioDeCuadro(
  cuerpo: unknown,
): Partial<Omit<CuadroNuevo, 'categoriaJuegoId'>> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<Omit<CuadroNuevo, 'categoriaJuegoId'>> = {};

  if (datos.categoriaId !== undefined) {
    cambio.categoriaId = entero(
      datos.categoriaId,
      'La categoría del torneo',
      1,
    );
  }
  if (datos.cupo !== undefined) cambio.cupo = cupoDelCuadro(datos.cupo);
  if (datos.montoInscripcionClp !== undefined) {
    cambio.montoInscripcionClp = montoDelCuadro(datos.montoInscripcionClp);
  }

  return cambio;
}
