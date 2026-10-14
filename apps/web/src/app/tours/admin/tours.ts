import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { proveerCampos } from '../../ui/campos';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Tours } from '../tours.service';

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
  imports: [
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    RouterLink,
    Aviso,
    Esqueleto,
    EstadoVacio,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- La cabecera del panel (TV7.1). Su acción abre el formulario de crear, como en
         Torneos: secundaria, porque la principal es la del formulario. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Tours</h1>
        <p class="mt-1 text-muted-foreground">
          Las ligas a las que suman los torneos, con sus temporadas y su puntaje.
        </p>
      </div>

      <button
        matButton="outlined"
        type="button"
        [attr.aria-expanded]="creando()"
        (click)="creando.set(!creando())"
      >
        {{ creando() ? 'Cerrar' : 'Crear tour' }}
      </button>
    </header>

    @if (creando()) {
      <form
        class="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4
               shadow-sm"
        (ngSubmit)="crear()"
      >
        <mat-form-field class="min-w-0 flex-1">
          <mat-label>Nombre</mat-label>
          <input
            matInput
            name="nombre"
            maxlength="80"
            placeholder="Tour FEDAL"
            [(ngModel)]="nombre"
          />
        </mat-form-field>
        <button
          matButton="filled"
          type="submit"
          [disabled]="creandoTour() || !nombre.trim()"
          [attr.aria-busy]="creandoTour()"
        >
          {{ creandoTour() ? 'Creando…' : 'Crear el tour' }}
        </button>
      </form>
    }

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }

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

  protected readonly creando = signal(false);
  protected readonly creandoTour = signal(false);
  protected readonly error = signal<string | null>(null);
  protected nombre = '';

  /** Crea el tour y abre su ficha: lo que sigue es completarlo. */
  protected async crear(): Promise<void> {
    this.error.set(null);
    this.creandoTour.set(true);

    try {
      const tour = await this.api.crear(this.nombre.trim());
      await this.router.navigate(['/administracion/tours', tour.id]);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo crear el tour.'));
    } finally {
      this.creandoTour.set(false);
    }
  }
}
