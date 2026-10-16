import { Component } from '@angular/core';

import { PestanasDeLaPantalla } from '../ui/pestanas-de-la-pantalla';

/**
 * Mi cuenta (T318, SPEC-sitio.md A8): las reservas, los partidos y la cuota del socio, que eran
 * tres pantallas y tres ítems del menú, en una página con pestañas. Cada una tiene su ruta,
 * debajo de `/mi-cuenta`, y `/mis-reservas` y `/mis-partidos` redirigen a la suya.
 */
@Component({
  selector: 'app-mi-cuenta',
  imports: [PestanasDeLaPantalla],
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Mi cuenta</h1>

    <app-pestanas-de-la-pantalla etiqueta="Secciones de tu cuenta" [pestanas]="PESTANAS" />
  `,
})
export class MiCuenta {
  protected readonly PESTANAS = [
    { ruta: '/mi-cuenta/reservas', etiqueta: 'Reservas' },
    { ruta: '/mi-cuenta/partidos', etiqueta: 'Partidos' },
    { ruta: '/mi-cuenta/cuota', etiqueta: 'Cuota' },
  ];
}
