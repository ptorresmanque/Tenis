import { Component, computed, model } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { proveerCampos } from '../../ui/campos';
import { fechaATexto, proveerFechaYHora, textoAFecha } from '../../ui/fecha-y-hora';
import { diaEnPalabras, proximosDias } from '../reloj-del-club';

/**
 * El día que se mira: la semana a un toque, «Otro día» para ir más lejos y el día en
 * palabras. El primer renglón de los controles de disponibilidad (D1, T267), aparte desde
 * T271 porque la agenda del día lo usa igual (D2).
 */
@Component({
  selector: 'app-selector-de-dia',
  imports: [MatButtonToggleModule, MatDatepickerModule, MatFormFieldModule, MatInput],
  providers: [proveerCampos(), proveerFechaYHora()],
  host: { class: 'contents' },
  template: `
    <div class="mt-4 flex flex-wrap items-end justify-between gap-4 md:flex-nowrap">
      <!-- La semana a un toque. El calendario sigue estando al lado para ir más
           lejos: siete chips cubren lo que la gente reserva de verdad, y el resto
           no justifica un calendario propio pudiendo usar el del sistema. La tira se
           desplaza de lado acá, no en el grupo: a 375 px no caben los siete días. -->
      <div class="w-full min-w-0 max-w-full overflow-x-auto md:w-auto">
        <mat-button-toggle-group
          class="chips"
          aria-label="Día"
          hideSingleSelectionIndicator
          [value]="fecha()"
          (change)="fecha.set($event.value)"
        >
          @for (opcion of chipsDeDia(); track opcion.valor) {
            <mat-button-toggle [value]="opcion.valor">
              <span>{{ opcion.etiqueta }}</span>
              @if (opcion.sub) {
                <span class="text-xl font-extrabold leading-none">{{ opcion.sub }}</span>
              }
            </mat-button-toggle>
          }
        </mat-button-toggle-group>
      </div>

      <!-- El cursor y el borde que responde (abre-al-tocar): sin eso, el campo se lee como
           una etiqueta con una fecha escrita y nadie prueba a abrirlo. -->
      <mat-form-field class="w-48 shrink-0 abre-al-tocar">
        <mat-label>Otro día</mat-label>
        <input
          matInput
          id="fecha"
          placeholder="dd-mm-aaaa"
          autocomplete="off"
          [matDatepicker]="calendarioFecha"
          [value]="diaElegido()"
          (dateChange)="cambiarFecha($event.value)"
        />
        <mat-datepicker-toggle matIconSuffix [for]="calendarioFecha" />
        <mat-datepicker #calendarioFecha />
      </mat-form-field>
    </div>

    <p class="mt-3 text-muted-foreground">{{ diaEnPalabras(fecha()) }}</p>
  `,
})
export class SelectorDeDia {
  readonly fecha = model.required<string>();

  /** Los siete chips de la tira de días, empezando por hoy. */
  protected readonly chipsDeDia = computed(() =>
    proximosDias(7).map((dia) => ({
      valor: dia.fecha,
      etiqueta: dia.etiqueta,
      sub: dia.numero,
    })),
  );

  /** El día del calendario: un `Date` estable mientras no cambie el día (T244). */
  protected readonly diaElegido = computed(() => textoAFecha(this.fecha()));

  protected cambiarFecha(fecha: Date | null): void {
    // El campo vacío —se puede borrar con el teclado— o una fecha que no existe no
    // disparan una consulta que la API va a rechazar.
    const valor = fechaATexto(fecha);
    if (valor) {
      this.fecha.set(valor);
    }
  }

  protected readonly diaEnPalabras = diaEnPalabras;
}
