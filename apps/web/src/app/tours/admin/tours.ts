import { Component, inject, resource } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatFabButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';

import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Tours } from '../tours.service';
import { NuevoTour } from './nuevo-tour';

/**
 * Los tours del club, en el panel (T191): las ligas a las que suman los torneos, cada una
 * con sus temporadas, niveles y ranking (`SPEC-tours.md`).
 *
 * **Se crean con solo el nombre** y se completan en su ficha: la descripción, la imagen,
 * las temporadas y la galería son cuatro tareas distintas, y un formulario que las pidiera
 * todas juntas obligaría a tenerlas listas antes de poder crear nada.
 */
@Component({
  selector: 'app-tours',
  // Espacio al final para que el FAB no tape el último tour (A9).
  host: { class: 'block pb-24' },
  imports: [MatFabButton, MatIcon, RouterLink, Esqueleto, EstadoVacio],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: crear un tour es el FAB, que abre su
         diálogo (T292), como en Torneos. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Tours</h1>
        <p class="mt-1 text-muted-foreground">
          Las ligas a las que suman los torneos, con sus temporadas y su puntaje.
        </p>
      </div>
    </header>

    <button matFab extended type="button" class="fab-de-la-pantalla" (click)="crear()">
      <mat-icon aria-hidden="true">add</mat-icon>
      Nuevo tour
    </button>

    @if (tours.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="3" etiqueta="Cargando los tours…" />
    } @else if (tours.error()) {
      <p class="mt-4 text-destructive">
        No se pudieron cargar los tours. Reintenta en un momento.
      </p>
    } @else if (tours.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="military_tech"
        titulo="Todavía no hay tours"
        detalle="Crea el primero con su nombre; las temporadas y los niveles se arman en su ficha."
      />
    } @else {
      <ul class="mt-4 grid gap-3">
        @for (tour of tours.value(); track tour.id) {
          <li
            class="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border
                   bg-card p-4 shadow-sm"
          >
            <a class="titulo-tarjeta text-primary" [routerLink]="['/administracion/tours', tour.id]">
              {{ tour.nombre }}
            </a>
            <span class="text-sm text-muted-foreground">
              @switch (tour.temporadas) {
                @case (0) {
                  Sin temporadas
                }
                @case (1) {
                  1 temporada
                }
                @default {
                  {{ tour.temporadas }} temporadas
                }
              }
            </span>
          </li>
        }
      </ul>
    }
  `,
})
export class ToursPanel {
  private readonly api = inject(Tours);
  private readonly router = inject(Router);

  protected readonly tours = resource({
    loader: () => this.api.listar(),
    defaultValue: [],
  });

  private readonly dialogos = inject(MatDialog);

  /** Abre el alta (T292) y, con el tour creado, su ficha: lo que sigue es completarlo. */
  protected async crear(): Promise<void> {
    const id = await firstValueFrom(
      this.dialogos
        .open<NuevoTour, void, number>(NuevoTour, { width: '28rem', maxWidth: '92vw' })
        .afterClosed(),
    );
    if (id !== undefined) await this.router.navigate(['/administracion/tours', id]);
  }
}
