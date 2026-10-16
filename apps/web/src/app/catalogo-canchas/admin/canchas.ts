import { Component, inject } from '@angular/core';

import { PestanasDeLaPantalla } from '../../ui/pestanas-de-la-pantalla';
import { horaEnElClub } from '../reloj-del-club';
import { HorasSinTarifa } from './admin-canchas.service';

/**
 * Canchas (T288, SPEC-panel.md D1): la lista de canchas, el horario y las tarifas del club, que
 * iban uno debajo del otro, en una pantalla con pestañas. Cada pestaña es su ruta.
 *
 * **La alarma de horas sin tarifa va arriba de las tres**: es lo único de esta pantalla que
 * cuesta plata si nadie lo mira, y lo que la apaga se arregla en cualquiera de ellas. La
 * pantalla provee `HorasSinTarifa`, y cada pestaña la relee al guardar.
 */
@Component({
  selector: 'app-pantalla-de-canchas',
  imports: [PestanasDeLaPantalla],
  providers: [HorasSinTarifa],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: cada pestaña trae la suya. -->
    <header class="cabecera-panel">
      <h1 class="titular text-4xl">Canchas</h1>
    </header>

    @if (alarma.advertencias.hasValue() && alarma.advertencias.value().length > 0) {
      <section
        class="mt-4 rounded-xl border border-destructive bg-card p-4"
        aria-labelledby="titulo-advertencias"
      >
        <!-- El rótulo de la alarma va en rojo: es la única sección que pide que
             alguien haga algo hoy. -->
        <h2
          id="titulo-advertencias"
          class="rotulo-seccion bg-destructive text-on-primary"
        >
          Horas sin tarifa hoy
        </h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Estas horas están abiertas y salen en $0. Casi siempre significa que
          falta una franja, no que el club las regale.
        </p>
        <ul class="mt-2 space-y-1 text-sm">
          @for (aviso of alarma.advertencias.value(); track aviso.canchaId) {
            <li>
              <span class="font-medium">{{ aviso.nombre }}</span>:
              {{ horasDe(aviso.sinTarifa) }}
            </li>
          }
        </ul>
      </section>
    }

    <app-pestanas-de-la-pantalla etiqueta="Secciones de canchas" [pestanas]="PESTANAS" />
  `,
})
export class PantallaDeCanchas {
  protected readonly alarma = inject(HorasSinTarifa);

  protected readonly PESTANAS = [
    { ruta: '/administracion/canchas', etiqueta: 'Canchas' },
    { ruta: '/administracion/canchas/horario', etiqueta: 'Horario' },
    { ruta: '/administracion/canchas/tarifas', etiqueta: 'Tarifas' },
  ];

  /** Las horas de una advertencia, en la hora del club y separadas por comas. */
  protected horasDe(instantes: string[]): string {
    return instantes.map((instante) => horaEnElClub(instante)).join(', ');
  }
}
