import { Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CampoHora } from '../../ui/campo-hora';

/** Una franja en que el jugador **no** puede jugar. */
export interface Franja {
  diaSemana: number;
  horaDesde: string;
  horaHasta: string;
}

/**
 * Lunes a viernes, y nada más.
 *
 * **El fin de semana no está**, y no es un olvido: el torneo se juega sábado y domingo,
 * así que ofrecerlos sería ofrecer inscribirse a un torneo que uno no puede jugar. El
 * servidor los rechaza igual; acá ni siquiera se muestran, para que nadie lo intente.
 */
const DIAS = [
  { valor: 1, nombre: 'Lunes' },
  { valor: 2, nombre: 'Martes' },
  { valor: 3, nombre: 'Miércoles' },
  { valor: 4, nombre: 'Jueves' },
  { valor: 5, nombre: 'Viernes' },
];

/**
 * Las franjas en que el inscrito no puede jugar.
 *
 * **Se declara cuándo NO se puede, no cuándo sí.** Es la diferencia que hace que el
 * formulario sea corto: casi nadie tiene restricciones y quien las tiene son dos o
 * tres. Al revés —marcar la disponibilidad— habría que llenar la semana entera para
 * decir lo mismo.
 */
@Component({
  selector: 'app-restriccion-horaria',
  imports: [FormsModule, CampoHora],
  template: `
    <fieldset class="mt-4">
      <legend class="font-display text-sm font-bold tracking-wide uppercase">
        ¿Hay horarios en que no puedas jugar?
      </legend>
      <p class="mt-1 max-w-prose text-sm text-muted-foreground">
        Solo de lunes a viernes: el torneo se juega el fin de semana. Si puedes
        siempre, no agregues ninguna. El club lo usa para programar tus partidos y
        <strong>no se publica</strong>.
      </p>

      @if (franjas().length > 0) {
        <ul class="mt-3 grid gap-2">
          @for (franja of franjas(); track $index) {
            <li class="flex flex-wrap items-end gap-2 rounded-lg bg-muted/40 p-2">
              <label class="text-sm">
                <span class="sr-only">Día de la franja {{ $index + 1 }}</span>
                <select
                  class="campo"
                  [attr.name]="'dia' + $index"
                  [ngModel]="franja.diaSemana"
                  (ngModelChange)="cambiar($index, { diaSemana: +$event })"
                >
                  @for (dia of DIAS; track dia.valor) {
                    <option [value]="dia.valor">{{ dia.nombre }}</option>
                  }
                </select>
              </label>

              <!-- Desde, a y hasta bajan juntos de línea; sin el botón del reloj caben en
                   una fila a 375px (T123). -->
              <span class="flex items-end gap-2">
                <label class="sr-only" [for]="'desde-' + $index">
                  Desde, franja {{ $index + 1 }}
                </label>
                <app-campo-hora
                  [inputId]="'desde-' + $index"
                  [name]="'desde' + $index"
                  claseCampo="w-24"
                  [conBoton]="false"
                  [ngModel]="franja.horaDesde"
                  (ngModelChange)="cambiar($index, { horaDesde: $event })"
                />

                <span class="pb-2 text-sm text-muted-foreground">a</span>

                <label class="sr-only" [for]="'hasta-' + $index">
                  Hasta, franja {{ $index + 1 }}
                </label>
                <app-campo-hora
                  [inputId]="'hasta-' + $index"
                  [name]="'hasta' + $index"
                  claseCampo="w-24"
                  [conBoton]="false"
                  [ngModel]="franja.horaHasta"
                  (ngModelChange)="cambiar($index, { horaHasta: $event })"
                />
              </span>

              <button
                type="button"
                class="boton boton-secundario boton-chico ms-auto"
                (click)="quitar($index)"
              >
                Quitar
                <span class="sr-only">la franja {{ $index + 1 }}</span>
              </button>
            </li>
          }
        </ul>
      }

      <button
        type="button"
        class="boton boton-secundario boton-chico mt-2"
        (click)="agregar()"
      >
        Agregar un horario en que no puedo
      </button>
    </fieldset>
  `,
})
export class RestriccionHoraria {
  /**
   * Las franjas, de ida y vuelta con el formulario que la contiene.
   *
   * `model()` y no un par de `input`/`output`: es un valor que el padre tiene y este
   * componente edita, que es exactamente para lo que existe.
   */
  readonly franjas = model.required<Franja[]>();

  protected readonly DIAS = DIAS;

  /** Martes por la tarde: el horario en que la mayoría dice que no puede. */
  protected agregar(): void {
    this.franjas.update((actuales) => [
      ...actuales,
      { diaSemana: 2, horaDesde: '18:00', horaHasta: '21:00' },
    ]);
  }

  protected quitar(indice: number): void {
    this.franjas.update((actuales) =>
      actuales.filter((_, i) => i !== indice),
    );
  }

  /**
   * Cambia un campo de una franja **sin mutar el arreglo**.
   *
   * Con `mutate` la señal no avisa del cambio y el padre manda al servidor lo que había
   * antes; es el defecto que las guías del proyecto prohíben por escrito.
   */
  protected cambiar(indice: number, cambio: Partial<Franja>): void {
    this.franjas.update((actuales) =>
      actuales.map((franja, i) =>
        i === indice ? { ...franja, ...cambio } : franja,
      ),
    );
  }
}
