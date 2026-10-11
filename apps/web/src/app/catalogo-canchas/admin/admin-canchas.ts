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

import { mensajeDelServidor } from '../../core/errores';
import { Insignia } from '../../ui/insignia';
import { hoyEnElClub, horaEnElClub } from '../reloj-del-club';
import { nombreDeSuperficie, SUPERFICIES } from '../superficies';
import {
  AdminCanchas,
  CanchaAdmin,
  CanchaNueva,
} from './admin-canchas.service';
import { EditorBloqueos } from './editor-bloqueos';
import { EditorFranjas } from './editor-franjas';
import { EditorHorarios } from './editor-horarios';
import { ReglasGeneralesPanel } from './reglas-generales';

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

const CANCHA_EN_BLANCO: CanchaNueva = {
  nombre: '',
  superficie: 'CEMENTO',
  techada: false,
  tieneCamara: false,
  iluminacion: false,
};

@Component({
  selector: 'app-admin-canchas',
  imports: [
    FormsModule,
    EditorHorarios,
    EditorFranjas,
    EditorBloqueos,
    ReglasGeneralesPanel,
    Insignia,
  ],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: cada sección trae la suya. -->
    <header class="cabecera-panel">
      <h1 class="titular text-4xl">Canchas del club</h1>
    </header>

    @if (advertencias.hasValue() && advertencias.value().length > 0) {
      <!-- Antes que la lista: es lo único de esta pantalla que cuesta plata si
           nadie lo mira. -->
      <section
        class="mt-4 rounded-xl border border-destructive bg-card p-4"
        aria-labelledby="titulo-advertencias"
      >
        <!-- El rótulo de la alarma va en rojo: es la única sección que pide que
             alguien haga algo hoy. -->
        <h2
          id="titulo-advertencias"
          class="rotulo-seccion bg-destructive text-on-primary"
        >
          Horas sin tarifa hoy
        </h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Estas horas están abiertas y salen en $0. Casi siempre significa que
          falta una franja, no que el club las regale.
        </p>
        <ul class="mt-2 space-y-1 text-sm">
          @for (aviso of advertencias.value(); track aviso.canchaId) {
            <li>
              <span class="font-medium">{{ aviso.nombre }}</span>:
              {{ horasDe(aviso.sinTarifa) }}
            </li>
          }
        </ul>
      </section>
    }

    <!-- Antes de las canchas: son las reglas que valen para todas, y la lista de
         abajo dice "vale el general del club" refiriéndose a esto. -->

    <app-reglas-generales (cambiado)="recargar()" />

    <section class="mt-8" aria-labelledby="titulo-nueva">
      <h2 id="titulo-nueva" class="rotulo-seccion">
        Agregar una cancha
      </h2>

      <form class="mt-3 flex flex-wrap items-end gap-3" (ngSubmit)="crear()">
        <div>
          <label for="nombre" class="block text-sm font-medium">Nombre</label>
          <input
            id="nombre"
            name="nombre"
            required
            class="campo mt-1"
            [(ngModel)]="nueva.nombre"
          />
        </div>

        <div>
          <label for="superficie" class="block text-sm font-medium">Superficie</label>
          <select
            id="superficie"
            name="superficie"
            class="campo mt-1"
            [(ngModel)]="nueva.superficie"
          >
            @for (opcion of superficies; track opcion[0]) {
              <option [value]="opcion[0]">{{ opcion[1] }}</option>
            }
          </select>
        </div>

        <label class="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" name="techada" [(ngModel)]="nueva.techada" />
          Techada
        </label>

        <label class="flex items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            name="tieneCamara"
            [(ngModel)]="nueva.tieneCamara"
          />
          Con cámara
          <span class="text-muted-foreground">
            — solo desde estas se pueden transmitir los partidos
          </span>
        </label>

        <label class="flex items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            name="iluminacion"
            [(ngModel)]="nueva.iluminacion"
          />
          Con iluminación
        </label>

        <button
          type="submit"
          [disabled]="guardando()"
          class="boton boton-primario"
        >
          Agregar
        </button>
      </form>

      <p role="status" aria-live="polite" class="mt-2 text-sm">
        @if (error()) {
          <span class="text-destructive">{{ error() }}</span>
        } @else if (aviso()) {
          <span class="text-accent-strong">{{ aviso() }}</span>
        }
      </p>
    </section>

    <section class="mt-8" aria-labelledby="titulo-listado">
      <h2 id="titulo-listado" class="rotulo-seccion">
        Canchas
      </h2>

      <!-- Solo la primera carga: al recargar tras una acción la lista se queda donde
           está. Reemplazada por "Cargando…", se llevaba el botón que tenía el foco. -->
      @if (canchas.status() === 'loading') {
        <p class="mt-3 text-muted-foreground">Cargando…</p>
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
            <li
              class="rounded-xl border border-border bg-card p-4 shadow-sm"
              [class.border-dashed]="!cancha.activa"
            >
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 class="titulo-tarjeta">
                  {{ cancha.nombre }}
                </h3>
                @if (!cancha.activa) {
                  <!-- Con palabras y no solo con el borde: una línea punteada no
                       dice por sí sola qué significa. -->
                  <app-insignia variante="neutro" icono="block">Desactivada</app-insignia>
                }

                <button
                  type="button"
                  [id]="'editar-ficha-' + cancha.id"
                  class="boton boton-secundario boton-chico ms-auto"
                  [attr.aria-expanded]="editando() === cancha.id"
                  (click)="abrirFicha(cancha)"
                >
                  Editar ficha
                  <span class="sr-only">de {{ cancha.nombre }}</span>
                </button>

                <button
                  type="button"
                  class="boton boton-secundario boton-chico"
                  (click)="alternarCamara(cancha)"
                >
                  {{ cancha.tieneCamara ? 'Quitar la cámara' : 'Marcar con cámara' }}
                  <span class="sr-only">de {{ cancha.nombre }}</span>
                </button>

                <button
                  type="button"
                  class="boton boton-secundario boton-chico"
                  (click)="alternarActiva(cancha)"
                >
                  {{ cancha.activa ? 'Desactivar' : 'Reactivar' }}
                </button>

                <!-- Para la cancha creada por error. La que el club dejó de usar se
                     desactiva; el servidor no deja borrar una con historial. -->
                <button
                  type="button"
                  class="boton boton-secundario boton-chico border-destructive text-destructive"
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
                  <div>
                    <label
                      [attr.for]="'ficha-nombre-' + cancha.id"
                      class="block text-sm font-medium"
                      >Nombre</label
                    >
                    <input
                      #campoNombre
                      [id]="'ficha-nombre-' + cancha.id"
                      name="nombre"
                      required
                      class="campo mt-1"
                      [attr.aria-invalid]="errorFicha() ? true : null"
                      [attr.aria-describedby]="'ficha-error-' + cancha.id"
                      [(ngModel)]="ficha.nombre"
                    />
                  </div>

                  <div>
                    <label
                      [attr.for]="'ficha-superficie-' + cancha.id"
                      class="block text-sm font-medium"
                      >Superficie</label
                    >
                    <select
                      [id]="'ficha-superficie-' + cancha.id"
                      name="superficie"
                      class="campo mt-1"
                      [(ngModel)]="ficha.superficie"
                    >
                      @for (opcion of superficies; track opcion[0]) {
                        <option [value]="opcion[0]">{{ opcion[1] }}</option>
                      }
                    </select>
                  </div>

                  <label class="flex items-center gap-2 py-2 text-sm">
                    <input
                      type="checkbox"
                      [id]="'ficha-techada-' + cancha.id"
                      name="techada"
                      [(ngModel)]="ficha.techada"
                    />
                    Techada
                  </label>

                  <label class="flex items-center gap-2 py-2 text-sm">
                    <input
                      type="checkbox"
                      name="iluminacion"
                      [(ngModel)]="ficha.iluminacion"
                    />
                    Con iluminación
                  </label>

                  <button
                    type="submit"
                    [disabled]="guardando()"
                    class="boton boton-primario boton-chico"
                  >
                    Guardar la ficha
                    <span class="sr-only">de {{ cancha.nombre }}</span>
                  </button>
                  <button
                    type="button"
                    class="boton boton-texto boton-chico"
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

                details y no un acordeón propio: el navegador ya trae el estado,
                el teclado y el anuncio al lector de pantalla. Cero JavaScript.
              -->
              <details class="mt-3 border-t border-border pt-3">
                <summary class="cursor-pointer text-sm font-semibold">
                  Horario, tarifas y bloqueos
                  <span class="sr-only">de {{ cancha.nombre }}</span>
                </summary>

                <h4 class="mt-3 subtitulo">Horario de apertura</h4>
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
              </details>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class AdminCanchasPanel {
  private readonly api = inject(AdminCanchas);

  /** Las opciones del `select`, en el orden en que están escritas en la tabla. */
  protected readonly superficies = Object.entries(SUPERFICIES);
  protected readonly nueva: CanchaNueva = { ...CANCHA_EN_BLANCO };

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

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

  protected readonly advertencias = resource({
    loader: () => this.api.advertencias(hoyEnElClub()),
    defaultValue: [],
  });

  protected async crear(): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);

    if (!this.nueva.nombre.trim()) {
      this.error.set('Ponle un nombre a la cancha.');
      return;
    }

    this.guardando.set(true);
    try {
      const creada = await this.api.crear({ ...this.nueva });
      this.aviso.set(`${creada.nombre} ya está en la grilla.`);
      Object.assign(this.nueva, CANCHA_EN_BLANCO);
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async alternarActiva(cancha: CanchaAdmin): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);

    try {
      await this.api.editar(cancha.id, { activa: !cancha.activa });
      this.aviso.set(
        cancha.activa
          ? `${cancha.nombre} salió de la grilla pública. Sus reservas siguen ahí.`
          : `${cancha.nombre} volvió a la grilla.`,
      );
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    }
  }

  /**
   * Marca o desmarca la cámara de una cancha **que ya existe**.
   *
   * La casilla del formulario de arriba solo sirve para la cancha que se está creando,
   * y una cámara casi nunca se instala el mismo día que se hizo la cancha: el club
   * tiene sus canchas cargadas hace meses y monta la cámara antes del torneo. Sin este
   * botón, la única forma de marcarla sería borrar la cancha y volver a crearla, que se
   * llevaría su historial.
   */
  protected async alternarCamara(cancha: CanchaAdmin): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);

    try {
      await this.api.editar(cancha.id, { tieneCamara: !cancha.tieneCamara });
      this.aviso.set(
        cancha.tieneCamara
          ? `${cancha.nombre} ya no se puede transmitir.`
          : `${cancha.nombre} queda disponible para transmitir.`,
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
    this.aviso.set(null);
    this.errorFicha.set(null);

    const nombre = this.ficha.nombre.trim();
    if (!nombre) {
      this.errorFicha.set('Ponle un nombre a la cancha.');
      return;
    }

    this.guardando.set(true);
    try {
      await this.api.editar(cancha.id, { ...this.ficha, nombre });
      this.aviso.set(
        nombre === cancha.nombre
          ? `Se guardó la ficha de ${nombre}.`
          : `${cancha.nombre} ahora se llama ${nombre}.`,
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
    this.aviso.set(null);

    if (
      !confirm(
        `¿Eliminar ${cancha.nombre}? Se van con ella su horario, sus tarifas y ` +
          'sus bloqueos. Esto no se puede deshacer.',
      )
    ) {
      return;
    }

    try {
      await this.api.eliminar(cancha.id);
      this.aviso.set(`${cancha.nombre} ya no está en el club.`);
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    }
  }

  /**
   * Relee canchas y advertencias: una tarifa nueva puede apagar una advertencia.
   *
   * Con `reload()` y no cambiando un parámetro: así el recurso queda en `reloading` y
   * conserva la lista mientras relee. Con un parámetro nuevo pasaba a `loading`, la
   * lista se vaciaba y el botón que tenía el foco desaparecía con ella (T96).
   */
  protected recargar(): void {
    this.canchas.reload();
    this.advertencias.reload();
  }

  protected nombreDia(dia: number): string {
    return DIAS[dia] ?? `Día ${dia}`;
  }

  protected readonly nombreSuperficie = nombreDeSuperficie;

  /** Las horas de una advertencia, en la hora del club y separadas por comas. */
  protected horasDe(instantes: string[]): string {
    return instantes.map((instante) => horaEnElClub(instante)).join(', ');
  }
}
