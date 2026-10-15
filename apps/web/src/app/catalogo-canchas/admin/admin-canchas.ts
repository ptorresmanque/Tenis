import {
  Component,
  effect,
  ElementRef,
  inject,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatCard } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatButton, MatFabButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIcon } from '@angular/material/icon';

import { confirmar } from '../../ui/dialogo-de-confirmacion';
import { proveerCampos } from '../../ui/campos';
import { mensajeDelServidor } from '../../core/errores';
import { nombreDeSuperficie, SUPERFICIES } from '../superficies';
import { AdminCanchas, CanchaAdmin, HorasSinTarifa } from './admin-canchas.service';
import { EditorBloqueos } from './editor-bloqueos';
import { EditorFranjas } from './editor-franjas';
import { EditorHorarios } from './editor-horarios';
import { NuevaCancha } from './nueva-cancha';
import { Esqueleto } from '../../ui/esqueleto';
import { LO_HECHO } from '../../ui/material';

const DIAS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/** Lo que se corrige de una cancha que ya existe (T96). */
type FichaDeCancha = Pick<
  CanchaAdmin,
  'nombre' | 'superficie' | 'techada' | 'iluminacion'
>;

@Component({
  selector: 'app-admin-canchas',
  // Espacio al final para que el FAB no tape la última tarjeta (A9).
  host: { class: 'block pb-24' },
  imports: [
    MatCard,
    MatCheckbox,
    MatSelectModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    MatFabButton,
    FormsModule,
    EditorHorarios,
    EditorFranjas,
    EditorBloqueos,
    Esqueleto,
    MatChipsModule,
    MatExpansionModule,
    MatIcon,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- Es la pestaña «Canchas» (T288): el titular y la alarma de horas sin tarifa van en la
         pantalla madre, y el horario y las tarifas del club, en sus pestañas. Agregar una
         cancha es el FAB, que abre su diálogo (T289). -->
    <button matFab extended type="button" class="fab-de-la-pantalla" (click)="agregar()">
      <mat-icon aria-hidden="true">add</mat-icon>
      Nueva cancha
    </button>

    <p role="status" aria-live="polite" class="text-sm">
      @if (error()) {
        <span class="text-destructive">{{ error() }}</span>
      }
    </p>

    <section aria-labelledby="titulo-listado">
      <!-- Para el lector y no a la vista: la pestaña ya dice «Canchas», y sin este título las
           tarjetas (h3) quedarían colgando del h1. -->
      <h2 id="titulo-listado" class="sr-only">Canchas del club</h2>

      <!-- Solo la primera carga: al recargar tras una acción la lista se queda donde
           está. Reemplazada por "Cargando…", se llevaba el botón que tenía el foco. -->
      @if (canchas.status() === 'loading') {
        <app-esqueleto class="mt-3 block" [filas]="5" etiqueta="Cargando las canchas…" />
      } @else if (canchas.error()) {
        <p class="mt-3 text-destructive">
          No se pudieron cargar las canchas. Reintenta en un momento.
        </p>
      } @else {
        <ul class="mt-3 space-y-3">
          @for (cancha of canchas.value(); track cancha.id) {
            <!-- La desactivada se marca con el borde punteado y no con opacidad:
                 apagada, su texto y sus botones quedaban bajo 4,5:1, y "Reactivar"
                 y "Eliminar" se siguen usando. -->
            <li>
              <mat-card appearance="outlined" class="p-4" [class.border-dashed]="!cancha.activa">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 class="titulo-tarjeta">
                    {{ cancha.nombre }}
                  </h3>
                  @if (!cancha.activa) {
                    <!-- Con palabras y no solo con el borde: una línea punteada no
                         dice por sí sola qué significa. -->
                    <mat-chip-set class="insignias">
                      <mat-chip class="insignia neutro">
                        <mat-icon matChipAvatar aria-hidden="true">block</mat-icon>
                        Desactivada
                      </mat-chip>
                    </mat-chip-set>
                  }

                  <button
                    matButton="outlined"
                    type="button"
                    [id]="'editar-ficha-' + cancha.id"
                    class="chico ms-auto"
                    [attr.aria-expanded]="editando() === cancha.id"
                    (click)="abrirFicha(cancha)"
                  >
                    Editar ficha
                    <span class="sr-only">de {{ cancha.nombre }}</span>
                  </button>

                  <button
                    matButton="outlined"
                    type="button"
                    class="chico"
                    (click)="alternarCamara(cancha)"
                  >
                    {{ cancha.tieneCamara ? 'Quitar la cámara' : 'Marcar con cámara' }}
                    <span class="sr-only">de {{ cancha.nombre }}</span>
                  </button>

                  <button
                    matButton="outlined"
                    type="button"
                    class="chico"
                    (click)="alternarActiva(cancha)"
                  >
                    {{ cancha.activa ? 'Desactivar' : 'Reactivar' }}
                  </button>

                  <!-- Para la cancha creada por error. La que el club dejó de usar se
                       desactiva; el servidor no deja borrar una con historial. -->
                  <button
                    matButton="outlined"
                    type="button"
                    class="peligro chico"
                    (click)="eliminar(cancha)"
                  >
                    Eliminar
                  </button>
                </div>

                @if (editando() === cancha.id) {
                  <!-- T96. Corregir la ficha sin borrar la cancha: borrarla se llevaría su
                       historial. Techada importa además por la tarifa de su tipo (T98). -->
                  <form
                    class="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3"
                    (ngSubmit)="guardarFicha(cancha)"
                  >
                    <mat-form-field>
                      <mat-label>Nombre</mat-label>
                      <input
                        matInput
                        #campoNombre
                        [id]="'ficha-nombre-' + cancha.id"
                        name="nombre"
                        required
                        [attr.aria-invalid]="errorFicha() ? true : null"
                        [aria-describedby]="'ficha-error-' + cancha.id"
                        [(ngModel)]="ficha.nombre"
                      />
                    </mat-form-field>

                    <mat-form-field>
                      <mat-label>Superficie</mat-label>
                      <mat-select
                        [id]="'ficha-superficie-' + cancha.id"
                        name="superficie"
                        [(ngModel)]="ficha.superficie"
                      >
                        @for (opcion of superficies; track opcion[0]) {
                          <mat-option [value]="opcion[0]">{{ opcion[1] }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>

                    <mat-checkbox
                      class="block text-sm"
                      [id]="'ficha-techada-' + cancha.id"
                      name="techada"
                      [(ngModel)]="ficha.techada"
                    >
                      Techada
                    </mat-checkbox>

                    <mat-checkbox
                      class="block text-sm"
                      name="iluminacion"
                      [(ngModel)]="ficha.iluminacion"
                    >
                      Con iluminación
                    </mat-checkbox>

                    <button
                      matButton="filled"
                      type="submit"
                      [disabled]="guardando()"
                      [attr.aria-busy]="guardando()"
                      class="chico"
                    >
                      Guardar la ficha
                      <span class="sr-only">de {{ cancha.nombre }}</span>
                    </button>
                    <button
                      matButton
                      type="button"
                      class="chico"
                      (click)="cerrarFicha(cancha.id)"
                    >
                      Cancelar
                    </button>

                    <!-- Junto al campo y no en el aviso de arriba: el nombre repetido es
                         lo que hay que corregir, y el aviso queda a una pantalla de acá. -->
                    <p
                      [id]="'ficha-error-' + cancha.id"
                      aria-live="polite"
                      class="w-full text-sm text-destructive"
                    >
                      {{ errorFicha() }}
                    </p>
                  </form>
                }

                <p class="mt-1 text-sm text-muted-foreground">
                  {{ nombreSuperficie(cancha.superficie) }}
                  @if (cancha.techada) {
                    · Techada
                  }
                  @if (cancha.iluminacion) {
                    · Con iluminación
                  }
                  @if (cancha.tieneCamara) {
                    · Con cámara
                  }
                </p>

                <!--
                  Los tres editores plegados, con details nativo.

                  Con ocho canchas abiertas a la vez la pantalla medía 10.683px en
                  el teléfono y 7.292px en el escritorio: ocho pantallazos de
                  scroll para cambiar una tarifa, y 269 campos de formulario
                  cargados a la vez. Es una pantalla de configuración, y quien
                  entra viene a tocar **una** cancha.

                  Un panel de Material (T281; antes, un details): trae el estado, el
                  teclado y el anuncio al lector de pantalla. Y con matExpansionPanelContent
                  los editores se crean recién al abrirlo: antes, cada cancha montaba los
                  suyos y pedía sus bloqueos aunque nadie la abriera.
                -->
                <mat-expansion-panel class="mt-3 border-t border-border">
                  <mat-expansion-panel-header>
                    <mat-panel-title class="text-sm font-semibold">
                      Horario, tarifas y bloqueos
                      <span class="sr-only">&nbsp;de {{ cancha.nombre }}</span>
                    </mat-panel-title>
                  </mat-expansion-panel-header>
                  <ng-template matExpansionPanelContent>
                    <h4 class="subtitulo">Horario de apertura</h4>
                    @if (cancha.horarios.length === 0) {
                      <p class="text-sm text-muted-foreground">
                        Sin horario propio: vale el general del club.
                      </p>
                    }
                    <app-editor-horarios [ambito]="cancha" (guardado)="recargar()" />

                    <h4 class="mt-3 subtitulo">Tarifas propias</h4>
                    <app-editor-franjas [ambito]="cancha" (cambiado)="recargar()" />

                    <h4 class="mt-3 subtitulo">Bloqueos</h4>
                    <app-editor-bloqueos [cancha]="cancha" />
                  </ng-template>
                </mat-expansion-panel>
              </mat-card>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class AdminCanchasPanel {
  private readonly dialogos = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(AdminCanchas);
  /** La alarma de la pantalla madre: una cancha nueva o una tarifa suya la pueden apagar. */
  private readonly alarma = inject(HorasSinTarifa);

  /** Las opciones del `select`, en el orden en que están escritas en la tabla. */
  protected readonly superficies = Object.entries(SUPERFICIES);

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** La cancha cuya ficha está abierta. Una a la vez: se viene a corregir una. */
  protected readonly editando = signal<number | null>(null);
  // Solo sus cuatro campos, y no una copia de la cancha en blanco: con `tieneCamara`
  // adentro, guardar el nombre le apagaba la cámara a la cancha.
  protected readonly ficha: FichaDeCancha = {
    nombre: '',
    superficie: 'CEMENTO',
    techada: false,
    iluminacion: false,
  };
  protected readonly errorFicha = signal<string | null>(null);

  private readonly campoNombre =
    viewChild<ElementRef<HTMLInputElement>>('campoNombre');
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Al abrir la ficha, el foco va al nombre: es lo que se viene a cambiar, y sin esto
    // quien usa teclado queda en el botón, arriba del formulario que acaba de abrir.
    effect(() => this.campoNombre()?.nativeElement.focus());
  }

  protected readonly canchas = resource({
    loader: () => this.api.canchas(),
    defaultValue: [],
  });

  /** Abre el alta (T289). El diálogo crea la cancha y muestra sus errores; acá, lo que sigue. */
  protected async agregar(): Promise<void> {
    const creada = await firstValueFrom(
      this.dialogos
        .open<NuevaCancha, void, CanchaAdmin>(NuevaCancha, { width: '32rem', maxWidth: '92vw' })
        .afterClosed(),
    );
    if (!creada) return;

    this.snackBar.open(`${creada.nombre} ya está en la grilla.`, undefined, LO_HECHO);
    this.recargar();
  }

  protected async alternarActiva(cancha: CanchaAdmin): Promise<void> {
    this.error.set(null);

    try {
      await this.api.editar(cancha.id, { activa: !cancha.activa });
      this.snackBar.open(
        cancha.activa
          ? `${cancha.nombre} salió de la grilla pública. Sus reservas siguen ahí.`
          : `${cancha.nombre} volvió a la grilla.`,
        undefined,
        LO_HECHO,
      );
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    }
  }

  /**
   * Marca o desmarca la cámara de una cancha **que ya existe**.
   *
   * La casilla del alta (el diálogo de «Nueva cancha») solo sirve para la cancha que se crea,
   * y una cámara casi nunca se instala el mismo día que se hizo la cancha: el club
   * tiene sus canchas cargadas hace meses y monta la cámara antes del torneo. Sin este
   * botón, la única forma de marcarla sería borrar la cancha y volver a crearla, que se
   * llevaría su historial.
   */
  protected async alternarCamara(cancha: CanchaAdmin): Promise<void> {
    this.error.set(null);

    try {
      await this.api.editar(cancha.id, { tieneCamara: !cancha.tieneCamara });
      this.snackBar.open(
        cancha.tieneCamara
          ? `${cancha.nombre} ya no se puede transmitir.`
          : `${cancha.nombre} queda disponible para transmitir.`,
        undefined,
        LO_HECHO,
      );
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    }
  }

  protected abrirFicha(cancha: CanchaAdmin): void {
    const { nombre, superficie, techada, iluminacion } = cancha;
    Object.assign(this.ficha, { nombre, superficie, techada, iluminacion });
    this.errorFicha.set(null);
    this.editando.set(cancha.id);
  }

  protected cerrarFicha(id: number): void {
    this.editando.set(null);
    // Cerrar sin devolver el foco lo manda al principio del documento, como en el menú
    // desplegable: quien usa teclado tendría que recorrer el panel entero para volver.
    this.anfitrion.nativeElement
      .querySelector<HTMLElement>(`#editar-ficha-${id}`)
      ?.focus();
  }

  /**
   * Guarda nombre, superficie, techo e iluminación de una vez.
   *
   * El nombre repetido lo rechaza el servidor con 409 —el nombre es único en la base—
   * y su mensaje se muestra junto al campo.
   */
  protected async guardarFicha(cancha: CanchaAdmin): Promise<void> {
    this.error.set(null);
    this.errorFicha.set(null);

    const nombre = this.ficha.nombre.trim();
    if (!nombre) {
      this.errorFicha.set('Ponle un nombre a la cancha.');
      return;
    }

    this.guardando.set(true);
    try {
      await this.api.editar(cancha.id, { ...this.ficha, nombre });
      this.snackBar.open(
        nombre === cancha.nombre
          ? `Se guardó la ficha de ${nombre}.`
          : `${cancha.nombre} ahora se llama ${nombre}.`,
        undefined,
        LO_HECHO,
      );
      this.cerrarFicha(cancha.id);
      this.recargar();
    } catch (falla) {
      this.errorFicha.set(mensajeDelServidor(falla));
    } finally {
      this.guardando.set(false);
    }
  }

  /**
   * Borra la cancha, después de preguntar.
   *
   * `confirm` nativo y no un diálogo propio: es una pregunta de sí o no, el
   * navegador ya la sabe hacer con foco y teclado, y un modal a medida sería
   * cincuenta líneas para lo mismo. Si el club pide algo más elaborado —escribir el
   * nombre para confirmar—, ahí se cambia.
   *
   * Quién puede borrarse lo decide el servidor: con historial responde 409 y su
   * mensaje se muestra tal cual.
   */
  protected async eliminar(cancha: CanchaAdmin): Promise<void> {
    this.error.set(null);

    const si = await confirmar(this.dialogos, {
      titulo: `¿Eliminar ${cancha.nombre}?`,
      detalle: 'Se van con ella su horario, sus tarifas y sus bloqueos. Esto no se puede deshacer.',
      confirmar: 'Sí, eliminar',
      peligro: true,
    });
    if (!si) return;

    try {
      await this.api.eliminar(cancha.id);
      this.snackBar.open(`${cancha.nombre} ya no está en el club.`, undefined, LO_HECHO);
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    }
  }

  /**
   * Relee las canchas y la alarma de arriba: una tarifa nueva puede apagar una advertencia.
   *
   * Con `reload()` y no cambiando un parámetro: así el recurso queda en `reloading` y
   * conserva la lista mientras relee. Con un parámetro nuevo pasaba a `loading`, la
   * lista se vaciaba y el botón que tenía el foco desaparecía con ella (T96).
   */
  protected recargar(): void {
    this.canchas.reload();
    this.alarma.recargar();
  }

  protected nombreDia(dia: number): string {
    return DIAS[dia] ?? `Día ${dia}`;
  }

  protected readonly nombreSuperficie = nombreDeSuperficie;
}
