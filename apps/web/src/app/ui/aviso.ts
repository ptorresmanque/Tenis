import { Component, computed, input } from '@angular/core';

export type VarianteAviso = 'info' | 'exito' | 'aviso' | 'error';

export const VARIANTES_AVISO: Record<VarianteAviso, { clases: string; icono: string }> = {
  info: {
    clases: 'border-primary/20 bg-selected text-foreground',
    icono: 'info',
  },
  exito: {
    clases: 'border-accent-strong/20 bg-accent-soft text-accent-strong',
    icono: 'check_circle',
  },
  aviso: {
    clases: 'border-warning/30 bg-warning-soft text-warning-strong',
    icono: 'warning',
  },
  error: {
    clases: 'border-destructive/20 bg-destructive/10 text-destructive-strong',
    icono: 'error',
  },
};

/**
 * El panel que explica algo antes de que la persona actúe, o después.
 *
 * El rol lo decide la variante: un error interrumpe al lector de pantalla
 * (`alert`) y el resto se anuncia sin cortar lo que esté leyendo (`status`).
 * Dejarlo a elección del consumidor terminaba con la mitad de los avisos mudos.
 *
 * `urgente` sube cualquier variante a `alert`, para lo que aparece **después de
 * pulsar algo** y hay que escuchar antes de seguir: la consecuencia de cancelar
 * una reserva, por ejemplo.
 */
@Component({
  selector: 'app-aviso',
  template: `
    <div
      [attr.role]="urgente() || variante() === 'error' ? 'alert' : 'status'"
      class="flex gap-3 rounded-xl border p-4"
      [class]="variante_().clases"
    >
      <span class="icono shrink-0 text-xl" aria-hidden="true">
        {{ icono() || variante_().icono }}
      </span>
      <div class="min-w-0 flex-1 text-sm">
        @if (titulo()) {
          <p class="font-display font-bold uppercase tracking-wide">{{ titulo() }}</p>
        }
        <ng-content />
      </div>
    </div>
  `,
})
export class Aviso {
  readonly variante = input.required<VarianteAviso>();
  readonly titulo = input('');
  readonly icono = input('');
  readonly urgente = input(false);

  protected readonly variante_ = computed(() => VARIANTES_AVISO[this.variante()]);
}
