/**
 * Dónde vive cada mitad del sistema, para armar las vueltas desde la pasarela.
 *
 * En un lugar y no copiadas en cada controlador que redirige: el día que el club
 * tenga dominio propio se cambia el `.env`, y una copia olvidada mandaría a la
 * persona a `localhost` después de haber pagado.
 */
export const web = () => process.env.WEB_ORIGIN ?? 'http://localhost:4200';

export const api = () =>
  process.env.API_PUBLIC_URL ??
  `http://localhost:${process.env.PORT ?? 3001}/api`;
