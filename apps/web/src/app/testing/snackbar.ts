/**
 * Para las pruebas: el texto del snackbar abierto (T254), que es donde sale la confirmación de lo
 * hecho. Se dibuja en el contenedor de overlays y no en el componente. Vacío si no hay ninguno.
 */
export const avisoDeLoHecho = () =>
  document.querySelector('mat-snack-bar-container')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
