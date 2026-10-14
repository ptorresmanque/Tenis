import { OverlayContainer } from '@angular/cdk/overlay';
import { ElementRef, inject, Injectable, Provider } from '@angular/core';

/**
 * El contenedor de los paneles de Material, dentro del `<dialog>` que tenga abierto el
 * componente (T248).
 *
 * Con un diálogo abierto con `showModal()`, todo lo que está fuera de él queda inerte. El
 * calendario pone su panel en el contenedor del body: se ve, porque es un popover de la capa
 * superior, pero no recibe clics ni foco. La lista y el reloj no tienen el problema, porque ponen
 * su panel junto al campo. Es la idea del `FullscreenOverlayContainer` de CDK, con el diálogo en
 * lugar de la pantalla completa. Se va con T252, cuando los diálogos sean `MatDialog`.
 *
 * Por componente y no en la raíz: así CDK overlay no entra al arranque (I6).
 */
@Injectable()
class ContenedorEnElDialogo extends OverlayContainer {
  private readonly anfitrion: HTMLElement = inject(ElementRef).nativeElement;

  override getContainerElement(): HTMLElement {
    const contenedor = super.getContainerElement();
    const lugar = this.anfitrion.querySelector('dialog[open]') ?? this._document.body;
    if (contenedor.parentElement !== lugar) lugar.append(contenedor);
    return contenedor;
  }
}

export function overlaysEnElDialogo(): Provider {
  return { provide: OverlayContainer, useClass: ContenedorEnElDialogo };
}
