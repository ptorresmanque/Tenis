import { Component, computed, input } from '@angular/core';

export type VarianteInsignia =
  | 'exito'
  | 'aviso'
  | 'error'
  | 'info'
  | 'neutro'
  | 'libre';

/**
 * Cada variante trae **su ícono además de su color**.
 *
 * Es la regla del master, no decoración: el par verde/rojo es justo el que no
 * distingue quien tiene daltonismo rojo-verde, así que un estado comunicado solo
 * por color no se comunica. Ícono y texto lo dicen igual en blanco y negro.
 *
 * Los fondos son el color al 10% sobre la tarjeta, que deja el texto por encima
 * de 4.5:1 en las seis. `libre` es la excepción y usa `accent-soft`, el fondo
 * sólido del bloque disponible de la grilla, medido en 4.83:1.
 */
export const VARIANTES_INSIGNIA: Record<VarianteInsignia, { clases: string; icono: string }> = {
  exito: {
    clases: 'border-accent-strong/20 bg-accent-strong/10 text-accent-strong',
    icono: 'check_circle',
  },
  aviso: {
    clases: 'border-warning/30 bg-warning-soft text-warning-strong',
    icono: 'schedule',
  },
  error: {
    clases: 'border-destructive/20 bg-destructive/10 text-destructive-strong',
    icono: 'cancel',
  },
  info: {
    clases: 'border-primary/20 bg-primary/10 text-primary',
    icono: 'info',
  },
  neutro: {
    clases: 'border-border bg-muted text-muted-foreground',
    icono: 'history',
  },
  libre: {
    clases: 'border-accent-strong/20 bg-accent-soft text-accent-strong',
    icono: 'circle',
  },
};

@Component({
  selector: 'app-insignia',
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
             text-xs font-semibold"
      [class]="variante_().clases"
    >
      <span class="icono text-sm" aria-hidden="true">{{ icono() || variante_().icono }}</span>
      <ng-content />
    </span>
  `,
})
export class Insignia {
  readonly variante = input.required<VarianteInsignia>();
  /** Para cuando el ícono de la variante no es el que dice esta insignia. */
  readonly icono = input('');

  protected readonly variante_ = computed(() => VARIANTES_INSIGNIA[this.variante()]);
}
