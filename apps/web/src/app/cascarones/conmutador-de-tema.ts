import { Component, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';

import { Modo, Tema } from './tema';

/** Las tres opciones, con el ícono y el texto que ve cada una. */
const OPCIONES: { modo: Modo; icono: string; etiqueta: string }[] = [
  { modo: 'auto', icono: 'brightness_auto', etiqueta: 'Según el sistema' },
  { modo: 'claro', icono: 'light_mode', etiqueta: 'Claro' },
  { modo: 'oscuro', icono: 'dark_mode', etiqueta: 'Oscuro' },
];

/**
 * El control para elegir tema.
 *
 * **Un grupo de opciones y no un interruptor**, porque son tres estados y no dos:
 * claro, oscuro, y seguir al sistema. Un interruptor de dos posiciones obligaría
 * a elegir para siempre y le quitaría al visitante el comportamiento que ya
 * tenía.
 *
 * Es un `mat-button-toggle-group` (T251): las flechas del teclado recorren el
 * grupo, Tab entra y sale una sola vez, y el lector anuncia "opción 2 de 3". El
 * aspecto es la clase `iconos` del tema.
 *
 * En la barra solo se ve el ícono; el nombre de cada opción viaja en su `title`
 * y en su `aria-label`, que es lo que oye quien no lo ve.
 */
@Component({
  selector: 'app-conmutador-de-tema',
  imports: [MatButtonToggleModule, MatIcon],
  host: { class: 'block' },
  template: `
    <mat-button-toggle-group
      class="iconos"
      aria-label="Tema del sitio"
      hideSingleSelectionIndicator
      [value]="tema.modo()"
      (change)="tema.modo.set($event.value)"
    >
      @for (opcion of OPCIONES; track opcion.modo) {
        <mat-button-toggle
          [value]="opcion.modo"
          [title]="opcion.etiqueta"
          [aria-label]="opcion.etiqueta"
        >
          <mat-icon class="icono-tema text-lg" aria-hidden="true">{{ opcion.icono }}</mat-icon>
        </mat-button-toggle>
      }
    </mat-button-toggle-group>
  `,
  styles: `
    /* El elegido crece, con un leve rebote (T150). Es una transición y no una
       animación a propósito: una transición no corre al cargar la página, solo
       cuando la persona cambia de tema. */
    .icono-tema {
      scale: 0.85;
      transition: scale var(--duracion-menu) var(--ease-rebote);
    }

    .mat-button-toggle-checked .icono-tema {
      scale: 1;
    }
  `,
})
export class ConmutadorDeTema {
  protected readonly tema = inject(Tema);
  protected readonly OPCIONES = OPCIONES;
}
