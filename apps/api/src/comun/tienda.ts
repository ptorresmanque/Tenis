/**
 * Si la tienda —la Etapa 2, fuera del trabajo de título— existe en este ambiente (T156).
 *
 * **Variable de entorno y no una columna**: lo que protege es código a medio construir,
 * que puede llegar a producción junto con una corrección de la tesis, y una columna en la
 * base no impide que ese código se ejecute (`SPEC-tienda.md` § El interruptor). En qa está
 * encendida; en producción no existe hasta el lanzamiento.
 *
 * Vive en `comun/` y no en `tienda/` porque la lee también `catalogo-canchas`, para
 * contárselo al sitio, y `catalogo-canchas` no depende de `tienda`. Se lee en cada
 * llamada y no al cargar el módulo: así un test la enciende y la apaga.
 */
export function tiendaHabilitada(): boolean {
  return process.env.TIENDA_HABILITADA === 'true';
}
