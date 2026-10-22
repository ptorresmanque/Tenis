import { Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';

/**
 * Lo que se ve en una dirección que no existe (T355, SPEC-seo.md A9).
 *
 * Antes la ruta comodín redirigía a la portada: para Google, cada dirección mal escrita o vieja
 * —las del sitio anterior de fedal.cl siguen en su índice— era una copia de la portada. Ahora la
 * URL no cambia, la página lleva `noindex` y Google la saca del índice como un 404.
 */
@Component({
  selector: 'app-no-encontrada',
  imports: [MatButton, RouterLink],
  template: `
    <article class="max-w-prose">
      <h1 class="titular text-5xl sm:text-6xl">No encontramos esta página</h1>
      <p class="mt-4">
        Puede que el enlace esté mal escrito o que la página ya no exista. Desde aquí puedes
        reservar tu cancha o volver al inicio.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <a matButton="filled" routerLink="/disponibilidad">Reservar cancha</a>
        <a matButton="outlined" routerLink="/">Ir al inicio</a>
      </div>
    </article>
  `,
})
export class NoEncontrada {}
