import { Component } from '@angular/core';

import { Esqueleto } from '../../ui/esqueleto';
import { Grilla } from './grilla';

/**
 * La página de `/disponibilidad` (T362, SPEC-seo.md D1).
 *
 * **La grilla entera va en `@defer`:** todo lo que dibuja depende del día de hoy (el selector, la
 * línea de lo elegido, el tablero) y de la API. En el prerender saldría con la fecha del build y
 * un error de carga; así el HTML trae el título y un esqueleto, y la grilla se dibuja en el
 * navegador, como siempre. El título del esqueleto es el mismo que el de la grilla, para que la
 * página no salte al terminar de cargar.
 */
@Component({
  selector: 'app-pagina-de-disponibilidad',
  imports: [Esqueleto, Grilla],
  template: `
    @defer (on immediate) {
      <app-grilla />
    } @placeholder {
      <h1 class="titular text-5xl sm:text-6xl">Reserva tu cancha</h1>
      <app-esqueleto class="mt-6 block" [filas]="6" etiqueta="Buscando horas disponibles…" />
    }
  `,
})
export class PaginaDeDisponibilidad {}
