/**
 * jsdom 28 no implementa los diálogos modales, y el lightbox de ng-gallery (la galería de fotos,
 * T309) abre uno con showModal(). Esto hace lo mínimo para probarlo: abrir y cerrar con el
 * atributo `open`, avisar el cierre como el navegador, y no tener animaciones que esperar.
 * Llamarlo en el beforeAll de la prueba.
 */
export function simularDialogoNativo(): void {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  // Al cerrarse, la librería espera las animaciones del diálogo antes de sacarlo.
  HTMLDialogElement.prototype.getAnimations ??= () => [];
}
