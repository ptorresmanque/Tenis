import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * El logotipo, en sus dos líneas: la marca y el descriptor.
 *
 * El descriptor va en `text-xs` y no en los 10px del diseño de Stitch: diez
 * píxeles no se leen, y el lint rechaza los valores arbitrarios de tipografía.
 */
@Component({
  selector: 'app-logotipo',
  imports: [RouterLink],
  template: `
    <a [routerLink]="destino()" class="flex shrink-0 flex-col leading-tight whitespace-nowrap">
      <span class="font-display text-xl font-black tracking-tight text-primary">
        FEDAL
      </span>
      <span
        class="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
        [class]="claseDescriptor()"
      >
        {{ descriptor() }}
      </span>
    </a>
  `,
})
export class Logotipo {
  /** "Club de Tenis" del diseño quedó fuera: el club se llama Tennis Center. */
  readonly descriptor = input('Tennis Center');
  readonly destino = input('/');
  /** Para esconder el descriptor donde la barra queda apretada en móvil. */
  readonly claseDescriptor = input('');
}
