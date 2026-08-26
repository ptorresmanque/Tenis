import { Cancha } from './disponibilidad';

/**
 * Cómo se escribe cada superficie en pantalla.
 *
 * Una sola tabla porque la superficie se muestra en cuatro pantallas —portada,
 * el club, disponibilidad y el panel— y estaba copiada en las cuatro. El día que
 * el club ponga una cancha de polvo de ladrillo, la que se olvide de actualizar
 * va a mostrar `POLVO_LADRILLO` en mayúsculas y nadie lo va a ver hasta que un
 * socio pregunte.
 *
 * El `<select>` del panel se arma desde acá con `Object.entries`: la lista de
 * opciones y la de nombres no pueden discrepar si son la misma.
 */
export const SUPERFICIES: Record<Cancha['superficie'], string> = {
  ARCILLA: 'Arcilla',
  CEMENTO: 'Cemento',
  PASTO_SINTETICO: 'Pasto sintético',
};

/**
 * El nombre en pantalla de una superficie.
 *
 * Devuelve el código tal cual si no lo conoce: la API puede empezar a mandar una
 * superficie nueva antes de que el front se entere, y es mejor leer un código
 * feo que un hueco en blanco donde iba el dato.
 */
export function nombreDeSuperficie(superficie: string): string {
  return SUPERFICIES[superficie as Cancha['superficie']] ?? superficie;
}
