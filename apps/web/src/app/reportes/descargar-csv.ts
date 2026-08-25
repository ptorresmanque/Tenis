import { Component, input } from '@angular/core';

/**
 * El botón que se lleva el reporte a una planilla.
 *
 * **Un enlace y no un botón con JavaScript.** El servidor ya manda el archivo con su
 * `Content-Disposition`, así que el navegador sabe qué hacer: `download` sobre un `<a>`
 * hace exactamente lo que hay que hacer, funciona con el clic derecho y se puede abrir
 * en otra pestaña. Armar el `Blob` a mano sería escribir código para hacer peor algo
 * que ya funciona.
 *
 * Está en su propio componente porque los cuatro reportes lo necesitan igual, y una
 * cuarta copia del mismo `<a>` es la que alguien va a cambiar en tres lugares.
 */
@Component({
  selector: 'app-descargar-csv',
  template: `
    <a [href]="url()" download class="boton boton-secundario boton-chico">
      <span class="icono text-base" aria-hidden="true">download</span>
      Descargar CSV
    </a>
  `,
})
export class DescargarCsv {
  /** La dirección del CSV, con el mismo rango y corte que se está mirando. */
  readonly url = input.required<string>();
}
