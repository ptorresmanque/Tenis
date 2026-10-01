import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input } from '@angular/core';

/** Las proporciones que el sitio usa. No hay más, y eso es a propósito. */
export type Proporcion = '16/9' | '4/3' | '3/2' | '3/4' | '1/1';

/**
 * El ancho que se le pide al club por proporción, en píxeles.
 *
 * Sale de dónde vive cada forma: 16/9 y 3/2 son fotos a ancho completo y
 * necesitan cubrir una pantalla grande al doble de densidad; 4/3, 3/4 y 1/1 van
 * en grillas de dos o tres columnas y con 1200 sobran.
 */
const ANCHO: Record<Proporcion, number> = {
  '16/9': 1600,
  '3/2': 1600,
  '4/3': 1200,
  '3/4': 1200,
  '1/1': 1200,
};

/**
 * Una foto del club, o el hueco donde va a ir.
 *
 * **Un componente con dos estados, no un `div` que después hay que borrar.**
 * Mientras no hay `src`, pinta un bloque de color plano con la descripción de
 * la foto que falta escrita encima. Cuando llega la foto, se le pasa la ruta y
 * no cambia nada más: ni el layout, ni la caja, ni el alto de la página.
 *
 * Esa es toda la idea. El club entrega las fotos después, el sitio se compone
 * antes, y reemplazar una foto es escribir una ruta.
 *
 * La descripción hace doble trabajo: sin foto es el pedido —qué tiene que
 * mostrar la imagen— y con foto es el texto alternativo. Escribirla una vez y
 * que sirva para las dos cosas es lo que evita que el `alt` termine siendo
 * "foto" en veinte lugares.
 *
 * `docs/fotos-pendientes.md` se genera recorriendo estos componentes, así que
 * lo que se escriba acá es literalmente lo que el club va a leer.
 */
@Component({
  selector: 'app-foto',
  imports: [NgOptimizedImage],
  template: `
    <div
      data-caja
      class="relative isolate w-full overflow-hidden"
      [class]="claseCaja()"
      [style.aspect-ratio]="proporcion()"
    >
      @if (src(); as ruta) {
        <img
          [ngSrc]="ruta"
          [alt]="descripcion()"
          [priority]="prioritaria()"
          fill
          class="object-cover"
        />
      } @else {
        <div
          data-marcador
          aria-hidden="true"
          class="flex h-full w-full flex-col items-center justify-start gap-2
                 px-6 py-6 text-center text-on-primary"
          [class]="claseFondo()"
        >
          <span class="icono text-3xl opacity-70" aria-hidden="true">photo_camera</span>
          <p class="max-w-prose text-sm font-semibold text-balance">
            {{ descripcion() }}
          </p>
          <p class="text-xs opacity-80">{{ proporcion() }} · {{ resolucion() }} mínimo</p>
        </div>
      }
    </div>
  `,
})
export class Foto {
  /**
   * Qué muestra la foto, en una frase.
   *
   * Se lee dos veces: el club la lee en el pedido y un lector de pantalla la
   * lee como `alt`. "Vista aérea de las tres canchas al atardecer" sirve para
   * las dos; "foto 1" no sirve para ninguna.
   */
  readonly descripcion = input.required<string>();
  readonly proporcion = input<Proporcion>('16/9');
  readonly src = input<string | null>(null);

  /** Para la foto del primer viewport, que es la que mide el LCP. */
  readonly prioritaria = input(false);

  /** Clases extra de la caja, para el redondeo o el ancho de cada slot. */
  readonly claseCaja = input('');

  protected readonly resolucion = computed(() => {
    const [ancho, alto] = this.proporcion().split('/').map(Number);
    return `${ANCHO[this.proporcion()]} × ${Math.round((ANCHO[this.proporcion()] * alto) / ancho)}`;
  });

  /**
   * El color del marcador, sacado de la descripción.
   *
   * Cuatro huecos del mismo azul en una pantalla se leen como un error de
   * carga, no como un andamio. Derivarlo del texto da variedad sin volverse
   * aleatorio: el mismo slot pinta igual en cada recarga y en cada captura, que
   * es lo que hace que las comparaciones de antes y después sirvan.
   *
   * Los dos fondos llevan `text-on-primary` encima y los dos pares están
   * medidos en `design-tokens.spec.ts`. No hay un tercer color porque no hay un
   * tercer par medido.
   */
  protected readonly claseFondo = computed(() => {
    const suma = [...this.descripcion()].reduce((total, letra) => total + letra.charCodeAt(0), 0);
    return suma % 2 === 0 ? 'bg-primary' : 'bg-secondary';
  });
}
