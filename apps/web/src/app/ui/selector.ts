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
 *
 * La opción elegida se marca con el rótulo, la placa de la transmisión (TV2.3):
 * tinta en claro, placa clara en oscuro. Es una pieza chica, que es lo único
 * para lo que el rótulo sirve; el par de contraste está medido en los dos temas.
 *
 * Los días van en mayúscula ("HOY 2") y los filtros segmentados no: en mayúscula
 * "Con iluminación" y "Al aire libre" se parten en dos líneas en un teléfono de
 * 375px, y sin ella los cuatro caben en una (333 de 343px, medido en la revisión
 * de TV2.3).
 */
@Component({
  selector: 'app-selector',
  // Las tres clases del host resuelven el mismo defecto por capas, y cada una
  // hace falta:
  //
  //   `block`      un componente de Angular es `inline` mientras nadie diga lo
  //                contrario, y un host inline se dimensiona por su contenido.
  //   `min-w-0`    este vive dentro de contenedores flex, y todo hijo flex trae
  //                `min-width: auto`, que le impide encogerse.
  //   `overflow-x-auto`  el scroll vive acá y no en el `<fieldset>` de adentro:
  //                **un fieldset no se encoge por debajo de su contenido** por
  //                mucho `min-width: 0` que se le ponga, así que su propio
  //                overflow no llega a usarse nunca.
  //
  // Sin las tres, la tira de siete días medía 504px dentro de una pantalla de
  // 375. Esos 145px eran el scroll horizontal que la auditoría del 2026-09-08
  // encontró en la pantalla más usada del sitio.
  host: { class: 'block min-w-0 max-w-full overflow-x-auto' },
  template: `
    <fieldset class="min-w-0">
      <legend class="sr-only">{{ etiqueta() }}</legend>

      <div
        [class]="
          estilo() === 'chips'
            ? 'flex w-max gap-2 pb-1'
            : 'inline-flex gap-1 rounded-lg bg-muted p-1'
        "
      >
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
            <span class="text-xl font-extrabold leading-none">{{ opcion.sub }}</span>
          }
        </label>
      }
      </div>
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

    // `relative` en la etiqueta: el radio va oculto con `sr-only`, que es
    // `position: absolute`, y sin ancestro posicionado se cuelga del documento.
    // Dentro de una tira con scroll eso empuja la página entera, que es el mismo
    // defecto que tenían los botones antes de que `.boton` fuera relative.
    return this.estilo() === 'chips'
      ? `relative flex min-w-16 shrink-0 cursor-pointer flex-col items-center gap-0.5
         rounded-xl border border-border bg-card px-3 py-2 font-display text-xs
         font-bold uppercase tracking-wider text-muted-foreground
         transition-colors has-[:checked]:border-rotulo has-[:checked]:bg-rotulo
         has-[:checked]:text-on-rotulo ${foco}`
      : `flex cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 font-display
         text-sm font-bold text-muted-foreground
         transition-colors has-[:checked]:bg-rotulo has-[:checked]:text-on-rotulo
         ${foco}`;
  });
}
