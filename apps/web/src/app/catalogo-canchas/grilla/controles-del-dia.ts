import { Component, input, model, output } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { Cancha, DuracionMin } from '../disponibilidad';
import { SelectorDeDia } from './selector-de-dia';

const FILTROS = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'techadas', etiqueta: 'Techadas' },
  { valor: 'iluminacion', etiqueta: 'Con iluminación' },
  { valor: 'aire-libre', etiqueta: 'Al aire libre' },
];

const DURACIONES = [
  { valor: '60', etiqueta: '1 hora' },
  { valor: '90', etiqueta: '1 hora y media' },
];

/** "1 hora y media", dicho igual que en el selector: lo leen la grilla y su línea (T345). */
export function etiquetaDeLaDuracion(duracion: DuracionMin): string {
  return DURACIONES.find(({ valor }) => valor === `${duracion}`)?.etiqueta ?? DURACIONES[0].etiqueta;
}

/** "Techadas", para la línea que resume lo elegido en el teléfono (T345). */
export function etiquetaDelFiltro(filtro: string): string {
  return FILTROS.find(({ valor }) => valor === filtro)?.etiqueta ?? FILTROS[0].etiqueta;
}

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
  imports: [MatButtonToggleModule, SelectorDeDia],
  host: { class: 'contents' },
  template: `
    <!-- Dos renglones al ancho del tablero (D1, T267): arriba el día, abajo qué se busca.
         En pantallas anchas, una columna sola dejaba media pantalla en blanco al lado de
         cada grupo; en el teléfono se apilan como antes. -->
    <app-selector-de-dia [(fecha)]="fecha" />

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
        <!-- flex-wrap: con la letra de T342, a 375 px los cuatro filtros se salían 10 px de la
             pantalla. Envuelven en dos renglones antes que esconder «Al aire libre». -->
        <mat-button-toggle-group
          aria-label="Filtrar canchas"
          class="max-w-full flex-wrap"
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

  protected readonly DURACIONES = DURACIONES;

  protected readonly FILTROS = FILTROS;
}
