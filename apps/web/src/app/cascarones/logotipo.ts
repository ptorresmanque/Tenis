import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * El logotipo del club, vectorizado del archivo que entregó el club.
 *
 * **Va con `<use>` y no como `<img src>`** por una razón concreta: el logotipo
 * tiene dos tonos y el sitio tiene dos temas, así que sus colores salen de
 * variables CSS. Un `<img>` no las recibe —el SVG externo se resuelve en su propio
 * documento— y quedaría con los valores del tema claro sobre un fondo oscuro. La
 * copia que dibuja `<use>`, en cambio, las hereda del documento. Hasta T263 el
 * trazado iba en la plantilla, y eran 22 kB de JavaScript en cada arranque.
 *
 * El archivo suelto sigue existiendo en `public/logo-fedal.svg` para lo que no
 * es esta aplicación: un correo, un documento, el favicon.
 *
 * Dice FEDAL TENNIS CENTER completo, con la silueta de un tenista recortada
 * dentro de la D, así que **el descriptor de dos líneas que este componente
 * dibujaba antes desapareció**: ya está dentro de la marca.
 */
@Component({
  selector: 'app-logotipo',
  imports: [RouterLink],
  template: `
    <a
      [routerLink]="destino()"
      class="flex shrink-0 items-center"
      [attr.aria-label]="'FEDAL Tennis Center, ir al ' + (destino() === '/' ? 'inicio' : 'panel')"
    >
      <!-- El trazado está en public/logotipo.svg y no acá (T263): eran 22 kB en el arranque. La
           copia que dibuja <use> hereda las variables de los dos tonos. -->
      <svg
        viewBox="0 0 1000 316.5"
        class="w-auto"
        [class]="clase()"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        <use href="/logotipo.svg#logotipo" />
      </svg>
    </a>
  `,
})
export class Logotipo {
  readonly destino = input('/');

  /**
   * El alto, para ajustarlo donde la barra queda apretada. Reemplaza al de por
   * omisión en vez de sumarse: con `h-9` fijo en el SVG, un `h-7` pasado acá
   * competía con él y perdía, así que el input no achicaba nada (TV2.4).
   */
  readonly clase = input('h-9');
}
