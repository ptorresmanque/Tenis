import { Component, computed, input, model } from '@angular/core';

export interface OpcionSelector {
  valor: string;
  etiqueta: string;
  /** La segunda línea del chip de día: "Vie" arriba, "21" abajo. */
  sub?: string;
  deshabilitada?: boolean;
}

/** Los grupos de radios se distinguen por `name`, y puede haber dos en pantalla. */
let contador = 0;

/**
 * Elegir una de pocas opciones: el control segmentado de los filtros y la tira
 * de días de la disponibilidad. Son el mismo widget con dos ropas.
 *
 * Por dentro son `<input type="radio">` de verdad, escondidos con `sr-only`. Eso
 * trae gratis lo que un grupo de botones sueltos obliga a escribir a mano: las
 * flechas del teclado recorren el grupo, Tab entra y sale una sola vez, y el
 * lector anuncia "opción 2 de 5". El aspecto sale de `has-[:checked]:` sobre la
 * etiqueta, así que tampoco hay clases calculadas en TypeScript.
 */
@Component({
  selector: 'app-selector',
  template: `
    <fieldset
      [class]="
        estilo() === 'chips'
          ? 'flex gap-2 overflow-x-auto pb-1'
          : 'inline-flex gap-1 rounded-lg bg-muted p-1'
      "
    >
      <legend class="sr-only">{{ etiqueta() }}</legend>

      @for (opcion of opciones(); track opcion.valor) {
        <label
          [class]="clasesDeOpcion()"
          [class.opacity-50]="opcion.deshabilitada"
          [class.cursor-not-allowed]="opcion.deshabilitada"
        >
          <input
            type="radio"
            class="sr-only"
            [name]="nombre"
            [value]="opcion.valor"
            [checked]="valor() === opcion.valor"
            [disabled]="opcion.deshabilitada ?? false"
            (change)="valor.set(opcion.valor)"
          />
          <span>{{ opcion.etiqueta }}</span>
          @if (opcion.sub) {
            <span class="text-base font-bold">{{ opcion.sub }}</span>
          }
        </label>
      }
    </fieldset>
  `,
})
export class Selector {
  readonly valor = model.required<string>();
  readonly opciones = input.required<readonly OpcionSelector[]>();
  /** Nombre del grupo para el lector de pantalla: "Filtrar canchas", "Día". */
  readonly etiqueta = input.required<string>();
  readonly estilo = input<'segmentado' | 'chips'>('segmentado');

  protected readonly nombre = `selector-${++contador}`;

  /**
   * El anillo de foco va en la etiqueta y no en el radio: el radio está oculto
   * con `sr-only` y su propio `:focus-visible` no se vería en ningún lado.
   */
  protected readonly clasesDeOpcion = computed(() => {
    const foco =
      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ' +
      'has-[:focus-visible]:outline-ring';

    return this.estilo() === 'chips'
      ? `flex min-w-16 shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-xl
         border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground
         transition-colors has-[:checked]:border-primary has-[:checked]:bg-selected
         has-[:checked]:text-primary ${foco}`
      : `flex cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-sm
         font-medium text-muted-foreground transition-colors has-[:checked]:bg-card
         has-[:checked]:text-primary has-[:checked]:shadow-sm ${foco}`;
  });
}
