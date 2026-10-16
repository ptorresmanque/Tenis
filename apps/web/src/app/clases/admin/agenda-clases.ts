import { Component, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatFabAnchor } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';

import { pedirMotivo } from '../../ui/dialogo-de-motivo';
import { SelectorDeDia } from '../../catalogo-canchas/grilla/selector-de-dia';
import {
  diaDeLaUrl,
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { ClaseDelDia, Clases, cupoEnPalabras, queClaseEs } from '../clases.service';
import { InscritosDeLaClase } from './inscritos';
import { Esqueleto } from '../../ui/esqueleto';
import { LO_HECHO } from '../../ui/material';

/**
 * Las clases del club, día por día. Agendar es otra página (T294), adonde lleva el FAB.
 */
@Component({
  selector: 'app-agenda-clases',
  // Espacio al final para que el FAB no tape la última clase (A9).
  host: { class: 'block pb-24' },
  imports: [
    MatButton,
    MatFabAnchor,
    MatIcon,
    RouterLink,
    Aviso,
    EstadoVacio,
    InscritosDeLaClase,
    Esqueleto,
    MatExpansionModule,
    SelectorDeDia,
  ],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: agendar es el FAB, que lleva a su página
         con el día que se está mirando (T294). -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Clases</h1>
      </div>
    </header>

    <!-- El día se elige como en la agenda (T293): la semana a un toque, «Otro día» y el día en
         palabras. Antes, flechas y un calendario propios. -->
    <app-selector-de-dia [fecha]="dia()" (fechaChange)="irAlDia($event)" />

    <a
      matFab
      extended
      class="fab-de-la-pantalla"
      routerLink="/administracion/clases/agendar"
      [queryParams]="{ fecha: dia() }"
    >
      <mat-icon aria-hidden="true">add</mat-icon>
      Agendar
    </a>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }

    @if (clases.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando la agenda de clases…" />
    } @else if (clases.error()) {
      <p class="mt-4 text-destructive">
        No se pudieron cargar las clases. Reintenta en un momento.
      </p>
    } @else if (clases.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="school"
        titulo="No hay clases este día"
        detalle="Agenda una con «Agendar»."
      />
    } @else {
      <!-- Cada clase es un panel (T293): cerrado, dice lo que hace falta para ubicarla, y al
           abrirlo muestra sus notas y sus inscritos, que se piden recién ahí. Antes era una
           tarjeta con un botón «Ver inscritos / Ocultar inscritos» hecho a mano. Independientes
           (multi): abrir una no cierra otra. -->
      <mat-accordion multi class="mt-4 block">
        @for (clase of clases.value(); track clase.id) {
          <mat-expansion-panel class="border-b border-border">
            <mat-expansion-panel-header>
              <mat-panel-title class="flex-wrap gap-x-2">
                <span class="font-display text-lg font-semibold">
                  {{ hora(clase.inicio) }}–{{ hora(clase.fin) }}
                </span>
                <span class="font-medium">{{ clase.lugar }}</span>
              </mat-panel-title>
              <mat-panel-description class="flex-wrap">
                {{ queClaseEs(clase) }} · {{ clase.profesor }} ·
                {{ cupoEnPalabras(clase.cupoMaximo) }}
                @if (clase.estado === 'REALIZADA') {
                  · Ya se dio
                }
              </mat-panel-description>
            </mat-expansion-panel-header>

            <ng-template matExpansionPanelContent>
              @if (clase.notas) {
                <p class="text-sm text-muted-foreground">{{ clase.notas }}</p>
              }
              <app-inscritos [claseId]="clase.id" />
            </ng-template>

            @if (clase.estado === 'PROGRAMADA') {
              <!-- Una clase que ya se dio no se cancela: el servidor lo rechaza y ofrecerlo
                   es un callejón. -->
              <mat-action-row>
                <!-- T117. Esta y las siguientes de la serie: las horas vuelven a la grilla y
                     las clases anteriores quedan como estaban. -->
                @if (clase.serieId !== null) {
                  <button
                    matButton
                    type="button"
                    class="chico"
                    [disabled]="trabajando()"
                    [attr.aria-busy]="enCurso() === 'cancelarSerieDesde-' + clase.id"
                    (click)="cancelarSerieDesde(clase, clase.serieId)"
                  >
                    Cancelar desde esta fecha
                  </button>
                }
                <button
                  matButton
                  type="button"
                  class="chico"
                  [disabled]="trabajando()"
                  [attr.aria-busy]="enCurso() === 'cancelar-' + clase.id"
                  (click)="cancelar(clase)"
                >
                  Cancelar clase
                </button>
              </mat-action-row>
            }
          </mat-expansion-panel>
        }
      </mat-accordion>
    }
  `,
})
export class AgendaDeClases {
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogos = inject(MatDialog);
  private readonly api = inject(Clases);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  /** El día que trae la URL: así se vuelve a él después de agendar (T294). Sin él, hoy. */
  readonly fecha = input<string>();
  protected readonly dia = linkedSignal(() => diaDeLaUrl(this.fecha()));

  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly clases = resource({
    params: () => ({ fecha: this.dia(), version: this.version() }),
    loader: ({ params }) => this.api.delDia(params.fecha),
    defaultValue: [] as ClaseDelDia[],
  });

  protected readonly hora = horaEnElClub;

  /**
   * El día elegido, también en la URL: «Atrás» desde la página de agendar vuelve a él, y el
   * enlace se comparte. Reemplazando la entrada y no sumando una: cambiar de día no es un paso
   * que se quiera deshacer con «Atrás».
   */
  protected irAlDia(dia: string): void {
    this.dia.set(dia);
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { fecha: dia },
      replaceUrl: true,
    });
  }

  protected readonly queClaseEs = queClaseEs;
  protected readonly cupoEnPalabras = cupoEnPalabras;

  protected async cancelar(clase: ClaseDelDia): Promise<void> {
    // El motivo es obligatorio: el diálogo no deja confirmar sin él (T253).
    const motivo = await pedirMotivo(this.dialogos, {
      titulo: `¿Cancelar la clase de ${clase.profesor}?`,
      detalle: 'La cancha vuelve a estar disponible, y el motivo queda escrito.',
      etiqueta: 'Por qué se cancela',
      confirmar: 'Cancelar la clase',
      peligro: true,
    });

    if (motivo === null) return;

    await this.intentar(`cancelar-${clase.id}`, async () => {
      await this.api.cancelar(clase.id, motivo);
      this.snackBar.open(
        'Clase cancelada. La cancha vuelve a estar disponible.',
        undefined,
        LO_HECHO,
      );
    });
  }

  /** Cancela esta clase y las siguientes de su serie, con el motivo (T117). */
  protected async cancelarSerieDesde(clase: ClaseDelDia, serieId: number): Promise<void> {
    const desde = fechaEnElClub(clase.inicio);
    const motivo = await pedirMotivo(this.dialogos, {
      titulo: `¿Cancelar la serie de ${clase.profesor} desde el ${diaEnPalabras(desde)}?`,
      detalle: 'Se cancelan esa clase y las siguientes de la serie.',
      etiqueta: 'Por qué se cancela',
      confirmar: 'Cancelar la serie',
      peligro: true,
    });

    if (motivo === null) return;

    await this.intentar(`cancelarSerieDesde-${clase.id}`, async () => {
      const { canceladas } = await this.api.cancelarSerieDesde(serieId, desde, motivo);
      this.snackBar.open(
        `Se cancelaron ${canceladas} ${canceladas === 1 ? 'clase' : 'clases'} de la serie, ` +
          `desde el ${diaEnPalabras(desde)}. Esas horas vuelven a estar disponibles.`,
        undefined,
        LO_HECHO,
      );
    });
  }

  private async intentar(clave: string, accion: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo cancelar la clase.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}
