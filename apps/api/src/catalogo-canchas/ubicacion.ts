import { BadRequestException } from '@nestjs/common';

export interface Ubicacion {
  latitud: number;
  longitud: number;
}

const NUMERO = String.raw`(-?\d+(?:\.\d+)?)`;
const LARGO_MAXIMO = 2048;

/**
 * De dónde sacar el par, en orden de confianza.
 *
 * Primero el `!3d…!4d…` del enlace de un lugar, que son las coordenadas del lugar. El
 * `@lat,lng` va después porque es el centro de la vista del mapa al copiar el enlace:
 * con él, el marcador puede quedar a una cuadra del club.
 */
const FORMATOS = [
  new RegExp(String.raw`!3d${NUMERO}!4d${NUMERO}`),
  new RegExp(String.raw`@${NUMERO},${NUMERO}`),
  new RegExp(
    String.raw`[?&](?:q|query|ll|destination)=${NUMERO}(?:,|%2C)\s*${NUMERO}`,
  ),
  // Lo que copia Google Maps con el clic derecho: "-33.4372, -70.6506".
  new RegExp(String.raw`^${NUMERO}\s*[,\s]\s*${NUMERO}$`),
];

/**
 * La ubicación del club a partir de lo que el admin pega (T100): un enlace de Google
 * Maps o las coordenadas. Vacío es borrarla.
 *
 * Seis decimales son unos 10 centímetros: de sobra para poner un marcador, y lo que
 * cabe en las columnas.
 */
export function leerUbicacion(texto: string): Ubicacion | null {
  const limpio = texto.trim();
  if (!limpio) return null;

  // Antes de cualquier expresión: una ráfaga de espacios hace retroceder la última en
  // tiempo cuadrático, y ningún enlace de Google Maps pasa de un par de miles.
  if (limpio.length > LARGO_MAXIMO) {
    throw new BadRequestException(
      'Eso es demasiado largo para ser un enlace de Google Maps.',
    );
  }

  // "Compartir" en Google Maps entrega estos, y no traen coordenadas: seguirlos
  // exigiría pedirle la página a Google desde el servidor.
  if (/goo\.gl\//i.test(limpio)) {
    throw new BadRequestException(
      'Ese es un enlace corto de Google Maps y no trae las coordenadas. En Google ' +
        'Maps, haz clic derecho sobre el club y toca las coordenadas para copiarlas, ' +
        'o pega el enlace largo de la barra del navegador.',
    );
  }

  const par = FORMATOS.map((formato) => formato.exec(limpio)).find(Boolean);

  if (!par) {
    throw new BadRequestException(
      'Pega el enlace de Google Maps del club o sus coordenadas, por ejemplo ' +
        '-33.4372, -70.6506.',
    );
  }

  const [latitud, longitud] = [Number(par[1]), Number(par[2])];

  if (Math.abs(latitud) > 90 || Math.abs(longitud) > 180) {
    throw new BadRequestException(
      'Esa ubicación no existe: la latitud va de -90 a 90 y la longitud de -180 a 180.',
    );
  }

  return { latitud: seisDecimales(latitud), longitud: seisDecimales(longitud) };
}

function seisDecimales(valor: number): number {
  return Math.round(valor * 1e6) / 1e6;
}
