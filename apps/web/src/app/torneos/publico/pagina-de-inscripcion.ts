import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { diaEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { GaleriaDeFotos } from '../../ui/galeria-de-fotos';
import { Torneos } from '../torneos.service';
import { InscripcionATorneo } from './inscripcion';
import { AVISOS_DEL_PAGO, soltarSiVolvioSinPagar } from './pago-pendiente';

/**
 * La inscripción a un torneo, en su página: `/torneos/:id/inscripcion` (T316, SPEC-sitio.md D4).
 *
 * Antes se desplegaba dentro de la tarjeta del torneo, con un botón que alternaba entre
 * «Inscribirme» y «Cerrar la inscripción». Acá van el nombre del torneo, su afiche chico (tocarlo
 * abre la galería, con las bases) y el formulario.
 *
 * **Es la página que manda a pagar**, así que es a la que se vuelve con «atrás» desde Webpay: aquí
 * se suelta el cupo de un pago sin terminar, y se dice. La vuelta normal de Webpay sigue en
 * `/torneos?pago=…` (A6).
 */
@Component({
  selector: 'app-pagina-de-inscripcion',
  imports: [
    Aviso,
    Esqueleto,
    EstadoVacio,
    GaleriaDeFotos,
    InscripcionATorneo,
    MatButton,
    MatIcon,
    RouterLink,
  ],
  template: `
    <a matButton routerLink="/torneos" class="mt-6">
      <mat-icon aria-hidden="true">arrow_back</mat-icon>
      Torneos
    </a>

    @if (volvioSinPagar()) {
      <app-aviso variante="error" class="mt-4 block">{{ SIN_PAGAR }}</app-aviso>
    }

    @if (calendario.error()) {
      <p class="mt-6 text-destructive">No se pudo cargar el torneo. Reintenta en un momento.</p>
    } @else if (calendario.value()) {
      @if (abierto(); as torneo) {
        <header class="mt-4">
          <p class="font-display text-sm font-bold tracking-wider text-muted-foreground uppercase">
            Inscripción
          </p>
          <h1 class="titular mt-1 text-5xl sm:text-6xl">{{ torneo.nombre }}</h1>
          <p class="mt-2 max-w-prose text-muted-foreground">
            Del {{ enPalabras(torneo.fechaInicio) }} al {{ enPalabras(torneo.fechaFin) }}.
            Inscripción hasta el {{ enPalabras(torneo.cierreInscripcion) }}.
          </p>
        </header>

        <div class="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
          @if (torneo.afiches[0]; as afiche) {
            <div class="w-48 shrink-0 lg:w-64">
              <button
                type="button"
                data-afiche
                class="block w-full cursor-pointer bg-muted"
                [attr.aria-label]="'Ver el afiche de ' + torneo.nombre"
                (click)="visor.abrir(0)"
              >
                <img
                  class="aspect-[3/4] w-full object-contain transition-opacity hover:opacity-80"
                  [src]="afiche.miniatura"
                  [alt]="afiche.descripcion ?? 'Afiche de ' + torneo.nombre"
                />
              </button>
              <app-galeria-de-fotos
                #visor
                [fotos]="torneo.afiches"
                [etiqueta]="'Fotos de ' + torneo.nombre"
              />
            </div>
          }

          <app-inscripcion-a-torneo
            class="block min-w-0 max-w-3xl flex-1"
            [torneoId]="torneo.id"
            [categorias]="torneo.categorias"
            [inscrito]="recargar"
          />
        </div>
      } @else {
        <app-estado-vacio
          class="mt-6 block"
          icono="event_busy"
          titulo="Este torneo ya no acepta inscripciones"
          detalle="Mira el calendario: puede haber otro con la inscripción abierta."
        >
          <a matButton="filled" routerLink="/torneos">Ver los torneos</a>
        </app-estado-vacio>
      }
    } @else if (calendario.isLoading()) {
      <app-esqueleto class="mt-6 block" [filas]="3" etiqueta="Cargando el torneo…" />
    }
  `,
})
export class PaginaDeInscripcion {
  /** El `:id` de la ruta, por `withComponentInputBinding`. */
  readonly id = input.required<string>();

  private readonly api = inject(Torneos);

  protected readonly SIN_PAGAR = AVISOS_DEL_PAGO['anulado'].texto;
  protected readonly enPalabras = diaEnPalabras;

  /** Volvió de Webpay con «atrás», sin pagar, y el servidor le soltó el cupo. */
  protected readonly volvioSinPagar = signal(false);

  /**
   * El calendario público, del que sale este torneo: no hay otra consulta de un torneo para quien
   * no tiene cuenta. Soltar un cupo lo deja viejo, y por eso lo tiene de parámetro.
   */
  protected readonly calendario = resource({
    params: () => this.volvioSinPagar(),
    loader: () => this.api.calendario(),
  });

  /** El torneo, si todavía acepta inscripciones: como en Torneos, abierto y con categorías. */
  protected readonly abierto = computed(
    () =>
      this.calendario
        .value()
        ?.find(
          (torneo) =>
            torneo.id === Number(this.id()) &&
            torneo.estado === 'INSCRIPCION' &&
            torneo.categorias.length > 0,
        ) ?? null,
  );

  /** Después de inscribirse, los cupos de cada categoría vuelven a pedirse. */
  protected readonly recargar = (): void => {
    this.calendario.reload();
  };

  constructor() {
    soltarSiVolvioSinPagar(() => this.volvioSinPagar.set(true));
  }
}
