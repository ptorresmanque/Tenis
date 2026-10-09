import { entero } from '../catalogo-canchas/admin.dto';
import { exigirTexto } from './torneos.dto';

/**
 * Lo que se lee del cuerpo para una categoría de juego: el nivel del **jugador**.
 *
 * **Archivo propio y no un rincón de `torneos.dto.ts`**, por lo mismo que
 * `categorias-juego.service.ts` no vive dentro de `torneos.service.ts`: ahí al lado
 * están `leerCategoria` y `leerCambioDeCategoria`, que leen la categoría del *torneo*
 * —la de `puntosCampeon`, de la que sale la escala del ranking— y tienen forma casi
 * idéntica a estas dos. Cuatro lectores parecidos en un archivo es cómo alguien
 * importa el de al lado sin notarlo. Ver `SPEC-torneos.md` § Las dos categorías que no
 * son la misma.
 *
 * `exigirTexto` sí se toma prestado de `torneos.dto.ts`: recortar un string no tiene
 * nada que ver con qué categoría es, y el repo ya arrastra seis copias privadas de ese
 * helper en otros tantos DTOs. No hacía falta una séptima.
 */
export interface CategoriaDeJuegoNueva {
  nombre: string;
  orden: number;
}

/** Cuántos caracteres caben. "Honor" es el nombre más largo que usa el club. */
const LARGO_DEL_NOMBRE = 40;

/**
 * El tope del lugar no es una regla del club.
 *
 * Es el techo que convierte un dedazo —un año escrito en el campo del orden— en un 400
 * y no en una categoría que queda arriba de Honor para siempre.
 */
const LUGAR_MAXIMO = 1000;

/** Lee una categoría de juego. El `orden` es su razón de ser. */
export function leerCategoriaDeJuego(cuerpo: unknown): CategoriaDeJuegoNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    nombre: exigirTexto(
      datos.nombre,
      'nombre de la categoría',
      LARGO_DEL_NOMBRE,
    ),
    orden: lugar(datos.orden),
  };
}

/** Lee una categoría de juego por cambiar. Desactivarla no pide repetir nada. */
export function leerCambioDeCategoriaDeJuego(
  cuerpo: unknown,
): Partial<CategoriaDeJuegoNueva> & { activa?: boolean } {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<CategoriaDeJuegoNueva> & { activa?: boolean } = {};

  if (datos.nombre !== undefined) {
    cambio.nombre = exigirTexto(
      datos.nombre,
      'nombre de la categoría',
      LARGO_DEL_NOMBRE,
    );
  }
  if (datos.orden !== undefined) {
    cambio.orden = lugar(datos.orden);
  }
  if (datos.activa !== undefined) {
    cambio.activa = datos.activa === true;
  }

  return cambio;
}

function lugar(valor: unknown): number {
  return entero(valor, 'El orden de la categoría', 1, LUGAR_MAXIMO);
}
