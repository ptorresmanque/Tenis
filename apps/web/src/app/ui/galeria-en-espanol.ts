import { Provider } from '@angular/core';
import { provideGalleryA11yOptions } from 'ng-gallery';

/**
 * Lo que la galería de fotos (`app-galeria-de-fotos`) le dice al lector de pantalla, en español
 * (T310, SPEC-sitio.md A11).
 *
 * Va en el EnvironmentInjector propio del componente: el lightbox de ng-gallery arma su diálogo
 * con ese inyector, y no ve los proveedores del componente. Las pruebas lo usan igual.
 */
export function proveerGaleriaEnEspanol(): Provider {
  return provideGalleryA11yOptions({
    containerLabel: 'Galería de fotos',
    containerRoleDescription: 'galería',
    itemRoleDescription: 'foto',
    itemLabel: (indice, total) => `Foto ${indice + 1} de ${total}`,
    rangeLabel: (desde, hasta, total) => `Fotos ${desde} a ${hasta} de ${total}`,
    thumbContainerLabel: 'Miniaturas',
    thumbLabel: (indice, total) => `Ver la foto ${indice + 1} de ${total}`,
    prevItemLabel: 'Foto anterior',
    nextItemLabel: 'Foto siguiente',
    // Lo que dice la flecha cuando lleva a un extremo, no cuando ya se está en él.
    firstItemLabel: 'Ir a la primera foto',
    lastItemLabel: 'Ir a la última foto',
    lightboxLabel: 'Galería de fotos',
    lightboxCloseButtonLabel: 'Cerrar la galería',
  });
}
