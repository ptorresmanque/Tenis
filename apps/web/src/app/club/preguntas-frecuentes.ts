import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';

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
 * **Cada pregunta es un panel desplegable de Material** (T281; antes, un `<details>`). Se
 * abre con el teclado y el lector anuncia si está abierto. Lo que se pierde: la búsqueda del
 * navegador ya no abre una respuesta cerrada. Llegan cerradas: la lista de preguntas se lee
 * de un vistazo.
 *
 * **El formulario de contacto va al final**, siempre: es la respuesta a la pregunta que
 * no está. También cuando no hay ninguna o la API no responde, y entonces la página
 * sigue sirviendo para algo.
 */
@Component({
  selector: 'app-preguntas-frecuentes-publicas',
  imports: [MatExpansionModule, Aviso, Esqueleto, FormularioContacto],
  template: `
    <h1 class="titular text-6xl sm:text-7xl">Preguntas frecuentes</h1>
    <p class="mt-2 max-w-prose text-lg text-muted-foreground">
      Lo que más nos preguntan. Si lo tuyo no está, escríbenos al final de la página.
    </p>

    <div class="mt-8 max-w-3xl aparece-al-pasar">
      <!-- Lo que viene de la API va en @defer (T364, SPEC-seo.md D1): el HTML del build
           trae el esqueleto, no un error de carga. -->
      @defer (on immediate) {
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
          <!-- multi: abrir una no cierra la otra, como con los <details> de antes. -->
          <mat-accordion multi class="block border-t border-border">
            @for (pregunta of lista(); track pregunta.id) {
              <mat-expansion-panel class="border-b border-border">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <span class="py-1 font-display text-xl font-bold tracking-wide">{{
                      pregunta.pregunta
                    }}</span>
                  </mat-panel-title>
                </mat-expansion-panel-header>
                <!-- Texto plano: pre-line respeta los saltos de línea del panel. -->
                <p class="max-w-prose whitespace-pre-line text-muted-foreground">{{ pregunta.respuesta }}</p>
              </mat-expansion-panel>
            }
          </mat-accordion>
        }
      } @placeholder {
        <app-esqueleto [filas]="5" etiqueta="Cargando las preguntas frecuentes…" />
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
