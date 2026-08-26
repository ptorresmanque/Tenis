import { toDataURL } from 'qrcode';

/**
 * El QR de la reserva, como imagen lista para un `<img>`.
 *
 * Con librería y sin culpa: un QR no son "unas líneas" —lleva corrección de errores
 * Reed-Solomon, máscaras y su tabla de versiones—, y escribirlo a mano sería la
 * clase de código que nadie vuelve a tocar. `qrcode` pesa poco y hace justo esto.
 *
 * Los colores se **leen de los tokens** y no se escriben acá: el azul del club sobre
 * blanco da 8:1, de sobra para cualquier lector de QR, y el día que la paleta cambie
 * el código no se entera. Un hex suelto acá sería un color que ningún test mide.
 */
export async function qrDeReserva(url: string): Promise<string> {
  return toDataURL(url, {
    // Nivel M: aguanta que se pierda un 15% del dibujo. Es un papel que se dobla en
    // un bolsillo y una pantalla con el brillo bajo, no una etiqueta de fábrica.
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: token('--color-primary'), light: token('--color-card') },
  });
}

/**
 * El valor de un token del sistema, tal como lo resolvió el navegador.
 *
 * Si no hay documento —o el token no existe— se devuelve `undefined` y la librería
 * usa su blanco y negro: un QR en negro se lee igual, y quedarse sin imagen porque
 * faltó un color sí rompería la entrada a la cancha.
 */
function token(nombre: string): string | undefined {
  const valor = getComputedStyle(document.documentElement)
    .getPropertyValue(nombre)
    .trim();

  return valor || undefined;
}

/** El enlace que el QR codifica: la página pública de esa reserva. */
export function enlaceDeReserva(token: string, origen = location.origin): string {
  return `${origen}/r/${token}`;
}
