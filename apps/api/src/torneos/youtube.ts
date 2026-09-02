/**
 * El identificador de un video de YouTube, sacado de lo que pegó el admin.
 *
 * **Es la decisión de seguridad de la transmisión, y no es cosmética.** Ese valor
 * termina dentro del `src` de un `iframe`: guardar el texto que pegó alguien y ponerlo
 * ahí es dejar que un campo de formulario decida qué sitio se carga dentro del nuestro.
 * Se extrae el id, se valida, y **la URL la arma el servidor**.
 *
 * Puro: se prueba solo, sin levantar nada.
 */

/**
 * Los once caracteres de un id de YouTube.
 *
 * Es su formato desde siempre: letras, dígitos, guion y guion bajo. Anclado a los dos
 * extremos, porque sin anclar `javascript:alert(1)//dQw4w9WgXcQ` traería un id válido
 * de adentro de algo que no lo es.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Las formas en que YouTube reparte el mismo video.
 *
 * `youtu.be/X`, `watch?v=X`, `/live/X`, `/embed/X` y `/shorts/X` son el mismo video, y
 * el club va a pegar cualquiera de ellas según de dónde copie el enlace. También se
 * acepta el id pelado, que es lo que queda al copiar desde el panel de YouTube.
 */
const RUTAS =
  /(?:youtu\.be\/|\/live\/|\/embed\/|\/shorts\/|\/v\/)([A-Za-z0-9_-]{11})/;
const PARAMETRO = /[?&]v=([A-Za-z0-9_-]{11})/;

/**
 * Devuelve el id, o `null` si lo pegado no contiene uno.
 *
 * **Solo mira dominios de YouTube.** Sin esa comprobación, `https://malo.cl/embed/
 * dQw4w9WgXcQ` daría un id perfectamente válido: el patrón de la ruta no distingue de
 * qué sitio viene, y el club estaría enlazando un video que no es el suyo.
 */
export function idDeYoutube(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;

  const limpio = valor.trim();

  // El id pelado, tal como se copia del panel de YouTube.
  if (ID.test(limpio)) return limpio;

  if (!esDeYoutube(limpio)) return null;

  return RUTAS.exec(limpio)?.[1] ?? PARAMETRO.exec(limpio)?.[1] ?? null;
}

/**
 * Que el enlace sea de YouTube de verdad.
 *
 * Se parsea la URL en vez de buscar el texto "youtube" adentro: `https://
 * youtube.malo.cl/embed/X` contiene esa palabra y no es de YouTube, y
 * `https://malo.cl/?x=youtube.com` tampoco. Lo que decide es el **host**.
 */
function esDeYoutube(valor: string): boolean {
  let host: string;

  try {
    host = new URL(valor).hostname.toLowerCase();
  } catch {
    return false;
  }

  return DOMINIOS.some(
    (dominio) => host === dominio || host.endsWith(`.${dominio}`),
  );
}

const DOMINIOS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];

/**
 * La URL del reproductor, **armada por el servidor**.
 *
 * `youtube-nocookie.com` y no `youtube.com`: sin eso, cada visitante que abre el
 * calendario del torneo carga scripts de Google y queda identificado por mirar una
 * página del club, aunque no toque nada. Es el mismo criterio que ya tomaron el
 * teléfono oculto de los jugadores y el token del QR de la reserva.
 */
export function urlDelReproductor(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

/** La miniatura, para la fachada que se muestra antes de cargar el reproductor. */
export function urlDeLaMiniatura(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
