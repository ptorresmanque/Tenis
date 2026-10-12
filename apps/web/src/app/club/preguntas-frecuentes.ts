import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';

import { Aviso } from '../ui/aviso';
import { Esqueleto } from '../ui/esqueleto';
import { FormularioContacto } from './formulario-contacto';

/** Lo que publica `GET /api/preguntas-frecuentes` (T144). */
interface PreguntaPublica {
  id: number;
  pregunta: string;
  respuesta: string;
}

/**
 * Las preguntas frecuentes del club (T146), que escribe desde su panel (T145).
 *
 * **Cada pregunta es un `<details>` nativo.** Se abre con el teclado, el lector anuncia
 * "contraído" y "expandido" sin una línea de ARIA nuestra, y la búsqueda del navegador
 * encuentra el texto de una respuesta cerrada y la abre. Llegan cerradas: la lista de
 * preguntas se lee de un vistazo.
 *
 * **El formulario de contacto va al final**, siempre: es la respuesta a la pregunta que
 * no está. También cuando no hay ninguna o la API no responde, y entonces la página
 * sigue sirviendo para algo.
 */
@Component({
  selector: 'app-preguntas-frecuentes-publicas',
  imports: [Aviso, Esqueleto, FormularioContacto],
  template: `
    <h1 class="titular text-6xl sm:text-7xl">Preguntas frecuentes</h1>
    <p class="mt-2 max-w-prose text-lg text-muted-foreground">
      Lo que más nos preguntan. Si lo tuyo no está, escríbenos al final de la página.
    </p>

    <div class="mt-8 max-w-3xl aparece-al-pasar">
      @if (preguntas.isLoading()) {
        <app-esqueleto [filas]="5" etiqueta="Cargando las preguntas frecuentes…" />
      } @else if (preguntas.error()) {
        <app-aviso variante="error">
          No pudimos cargar las preguntas. Si tienes una duda, escríbenos más abajo.
        </app-aviso>
      } @else if (lista().length === 0) {
        <p class="text-muted-foreground">
          Todavía no hay preguntas publicadas. Si tienes una, escríbenos más abajo y te
          respondemos.
        </p>
      } @else {
        <div class="border-t border-border">
          @for (pregunta of lista(); track pregunta.id) {
            <details class="group border-b border-border">
              <summary
                class="flex min-h-14 cursor-pointer list-none items-center justify-between
                       gap-4 py-4 font-display text-xl font-bold tracking-wide"
              >
                <span>{{ pregunta.pregunta }}</span>
                <span
                  class="icono text-2xl text-primary transition-transform group-open:rotate-180"
                  aria-hidden="true"
                >
                  expand_more
                </span>
              </summary>
              <!-- Texto plano: pre-line respeta los saltos de línea del panel. -->
              <p class="max-w-prose pb-5 whitespace-pre-line text-muted-foreground">{{ pregunta.respuesta }}</p>
            </details>
          }
        </div>
      }
    </div>

    <div class="mt-16 aparece-al-pasar">
      <app-formulario-contacto />
    </div>
  `,
  styles: `
    /* El triángulo de Safari: list-none quita el de los demás, este no. La flecha que
       gira es la nuestra. */
    summary::-webkit-details-marker {
      display: none;
    }
  `,
})
export class PreguntasFrecuentesPublicas {
  protected readonly preguntas = httpResource<PreguntaPublica[]>(
    () => '/api/preguntas-frecuentes',
  );

  /** `value()` lanza en estado de error. */
  protected readonly lista = computed(() =>
    this.preguntas.hasValue() ? this.preguntas.value() : [],
  );
}
