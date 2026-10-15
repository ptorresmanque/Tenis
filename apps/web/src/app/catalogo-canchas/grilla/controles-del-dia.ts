import { Component, computed, input, model, output } from '@angular/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { proveerCampos } from '../../ui/campos';
import { fechaATexto, proveerFechaYHora, textoAFecha } from '../../ui/fecha-y-hora';
import { Cancha, DuracionMin } from '../disponibilidad';
import { diaEnPalabras, proximosDias } from '../reloj-del-club';

const FILTROS = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'techadas', etiqueta: 'Techadas' },
  { valor: 'iluminacion', etiqueta: 'Con iluminación' },
  { valor: 'aire-libre', etiqueta: 'Al aire libre' },
];

/**
 * Si la cancha pasa el filtro elegido. Junto a `FILTROS`: las opciones y lo que significa
 * cada una se leen en el mismo lugar.
 *
 * "Al aire libre" es lo contrario de techada y no un atributo propio: si fuera un tercer
 * campo del modelo, tarde o temprano existiría una cancha marcada como techada y al aire
 * libre a la vez.
 */
export function pasaElFiltro(cancha: Cancha, filtro: string): boolean {
  switch (filtro) {
    case 'techadas':
      return cancha.techada;
    case 'iluminacion':
      return cancha.iluminacion;
    case 'aire-libre':
      return !cancha.techada;
    default:
      return true;
  }
}

/**
 * Qué se mira en la grilla: el día, la duración y el filtro de canchas. La leyenda la trae
 * el tablero (T265).
 *
 * La duración no es un `model` porque vive en la URL (T83b): la grilla la cambia ahí, y
 * esto solo avisa la elegida.
 */
@Component({
  selector: 'app-controles-del-dia',
  imports: [
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatButtonToggleModule,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  host: { class: 'contents' },
  template: `
    <!-- Dos renglones al ancho del tablero (D1, T267): arriba el día, abajo qué se busca.
         En pantallas anchas, una columna sola dejaba media pantalla en blanco al lado de
         cada grupo; en el teléfono se apilan como antes. -->
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

    <!-- El rótulo a la vista dice qué es cada grupo; el lector lo oye del aria-label. -->
    <div class="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="font-display text-xs font-bold tracking-wide text-muted-foreground uppercase"
          aria-hidden="true"
        >
          Duración
        </span>
        <!-- También al mover (T87): parte en la de la reserva, que trae el enlace de "mis
             reservas", y cambiarla es alargarla o acortarla. -->
        <mat-button-toggle-group
          aria-label="Duración"
          hideSingleSelectionIndicator
          [value]="'' + duracion()"
          (change)="cambiarDuracion.emit($event.value)"
        >
          @for (opcion of DURACIONES; track opcion.valor) {
            <mat-button-toggle [value]="opcion.valor">
              {{ opcion.etiqueta }}
            </mat-button-toggle>
          }
        </mat-button-toggle-group>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <span
          class="font-display text-xs font-bold tracking-wide text-muted-foreground uppercase"
          aria-hidden="true"
        >
          Canchas
        </span>
        <!-- Los filtros salen de lo que la cancha ya declara —techada e
             iluminación—, así que filtran en el navegador sobre lo que ya llegó:
             una consulta más al servidor no traería nada nuevo. -->
        <mat-button-toggle-group
          aria-label="Filtrar canchas"
          hideSingleSelectionIndicator
          [value]="filtro()"
          (change)="filtro.set($event.value)"
        >
          @for (opcion of FILTROS; track opcion.valor) {
            <mat-button-toggle [value]="opcion.valor">
              {{ opcion.etiqueta }}
            </mat-button-toggle>
          }
        </mat-button-toggle-group>
      </div>
    </div>
  `,
})
export class ControlesDelDia {
  readonly fecha = model.required<string>();
  readonly duracion = input.required<DuracionMin>();
  readonly filtro = model.required<string>();

  /** "60" o "90", como los valores del selector. */
  readonly cambiarDuracion = output<string>();

  protected readonly DURACIONES = [
    { valor: '60', etiqueta: '1 hora' },
    { valor: '90', etiqueta: '1 hora y media' },
  ];

  protected readonly FILTROS = FILTROS;

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
