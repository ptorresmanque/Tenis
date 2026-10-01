import { Component, inject } from '@angular/core';

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
 * **Un grupo de radios y no un interruptor**, porque son tres estados y no dos:
 * claro, oscuro, y seguir al sistema. Un interruptor de dos posiciones obligaría
 * a elegir para siempre y le quitaría al visitante el comportamiento que ya
 * tenía.
 *
 * Los radios son de verdad, escondidos con `sr-only`, igual que en el selector
 * de días: eso trae gratis las flechas del teclado, un solo Tab para entrar y
 * salir del grupo, y el anuncio de "opción 2 de 3". El aspecto sale de
 * `has-[:checked]:`, así que tampoco hay clases calculadas en TypeScript.
 *
 * En la barra solo se ve el ícono; el nombre de cada opción viaja en su
 * `title` y en el `sr-only` de adentro, que es lo que oye quien no lo ve.
 */
@Component({
  selector: 'app-conmutador-de-tema',
  host: { class: 'block' },
  template: `
    <fieldset class="flex items-center gap-0.5 rounded-control bg-muted p-0.5">
      <legend class="sr-only">Tema del sitio</legend>

      @for (opcion of OPCIONES; track opcion.modo) {
        <label
          [title]="opcion.etiqueta"
          class="relative flex size-8 cursor-pointer items-center justify-center
                 rounded-control text-muted-foreground transition-colors
                 has-[:checked]:bg-card has-[:checked]:text-primary
                 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2
                 has-[:focus-visible]:outline-ring"
        >
          <input
            type="radio"
            class="sr-only"
            name="tema"
            [value]="opcion.modo"
            [checked]="tema.modo() === opcion.modo"
            (change)="tema.modo.set(opcion.modo)"
          />
          <span class="icono text-lg" aria-hidden="true">{{ opcion.icono }}</span>
          <span class="sr-only">{{ opcion.etiqueta }}</span>
        </label>
      }
    </fieldset>
  `,
})
export class ConmutadorDeTema {
  protected readonly tema = inject(Tema);
  protected readonly OPCIONES = OPCIONES;
}
