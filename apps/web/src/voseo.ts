/**
 * Las formas del voseo rioplatense que no entran al sitio.
 *
 * Vive aparte porque la usan dos tests: el del front, que mira las plantillas
 * (`design-tokens.spec.ts`), y el de la API, que mira los mensajes que el
 * backend le devuelve al usuario (`apps/api/src/espanol-de-chile.spec.ts`).
 * Una sola lista para que las dos reglas no se separen.
 *
 * Los límites van con \p{L} y no con \b: el \b de JavaScript es ASCII, así que
 * ve un límite de palabra justo después de una "á" y da por voseante la "pagá"
 * que hay dentro de "pagándose".
 *
 * Lleva la bandera `g`: úsala con `matchAll`, que la clona. Con `test` o
 * `exec` arrastra el `lastIndex` de una llamada a la siguiente.
 */
export const VOSEO =
  /(?<!\p{L})(?:vos|tenés|podés|querés|sabés|necesitás|debés|sos|reservá|elegí|mirá|entrá|andá|hacé|hacete|poné|sacá|dejá|avisá|revisá|escribí|seguí|agregá|cambiá|creá|pagá|volvé|llevá|buscá|probá|tocá|apretá|ingresá|completá|confirmá|guardá|declará|acordate|acercate|fijate|ponete|corregime|avisame|decime)(?!\p{L})/giu;

/**
 * "Pico" y "valle", que desde el 2026-10-13 se dicen "prime" y "normal" (T209, T210).
 *
 * Solo el texto que se lee: en el código y en la base sigue `esPico`, que no es palabra
 * suelta. El borde deja afuera también el guion bajo, para que el `es_pico` de un SQL crudo
 * no cuente como texto. Lleva la bandera `g`, igual que `VOSEO`.
 */
export const PICO_Y_VALLE = /(?<![\p{L}_])(?:picos?|valles?)(?![\p{L}_])/giu;
