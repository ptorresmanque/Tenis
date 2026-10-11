import { mostrarTelefono } from './telefono';

/**
 * Los datos de contacto del club, como el admin los carga en "Datos del club": los que el
 * sitio público muestra y los que firman cada correo.
 */
export interface DatosDelClub {
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  /** Para el mapa de "El club" (T100). Nulas mientras el admin no la cargue. */
  latitud: number | null;
  longitud: number | null;
}

/**
 * La firma de todo correo del club (T108; la reutilizan T109 a T112).
 *
 * Lo que el club no cargó no aparece, ni como línea vacía ni como separador suelto. "Cómo
 * llegar" va a Google Maps con el destino puesto, como el botón de "El club" (T101): en un
 * correo es lo que se abre desde el teléfono camino a la cancha.
 */
export function firmaDelClub(club: DatosDelClub): string {
  const contacto = [mostrarTelefono(club.telefono), club.email]
    .filter(Boolean)
    .join(' · ');
  const comoLlegar =
    club.latitud !== null && club.longitud !== null
      ? 'Cómo llegar: https://www.google.com/maps/dir/?api=1&destination=' +
        `${club.latitud},${club.longitud}`
      : '';

  // "-- " con el espacio: es el separador de firma que los clientes de correo reconocen.
  return ['-- ', club.nombre, club.direccion, contacto, comoLlegar]
    .filter(Boolean)
    .join('\n');
}
