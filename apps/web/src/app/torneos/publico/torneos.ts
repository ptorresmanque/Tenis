import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar } from '@angular/material/snack-bar';

import { diaEnPalabras, enPesos } from '../../catalogo-canchas/reloj-del-club';
import { nombreDeSuperficie } from '../../catalogo-canchas/superficies';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
// Alias: `torneos.service` ya exporta un tipo `Foto`, que son las de la
// galería del torneo. Este es el componente que reserva el hueco de una
// foto del sitio mientras el club no la entrega.
import { Foto as FotoDelSitio } from '../../ui/foto';
import { LO_HECHO } from '../../ui/material';
import { CartelDelTorneo } from './cartel-del-torneo';
import { CuadroPublicoModal } from './cuadro-publico';
import { AVISOS_DEL_PAGO, soltarSiVolvioSinPagar } from './pago-pendiente';
import {
  aceptaInscripciones,
  ESTADOS_TORNEO,
  Torneos,
  TorneoPublico,
} from '../torneos.service';
import { Esqueleto } from '../../ui/esqueleto';
import { Club } from '../../club/club.service';
import { eventosDeTorneos, publicar } from '../../seo/datos-estructurados';

/**
 * Los torneos del club, para quien mira desde afuera.
 *
 * **El calendario es de las pocas cosas que un tercero mira antes de asociarse**: un
 * club con torneos es un club con vida. Y el cuadro es el mismo mural del club en el
 * teléfono de quien está sentado en la cancha de al lado esperando su turno.
 *
 * De las personas sale el nombre y nada más. El teléfono de un jugador lo tiene el club
 * para llamarlo, no para publicarlo.
 */
@Component({
  selector: 'app-torneos-publicos',
  imports: [
    MatButton,
    MatIcon,
    MatTableModule,
    FotoDelSitio,
    Aviso,
    CartelDelTorneo,
    CuadroPublicoModal,
    EstadoVacio,
    Esqueleto,
    RouterLink,
    MatChipsModule,
  ],
  template: `
    <section
      class="relative isolate a-sangre overflow-hidden"
      aria-labelledby="torneos"
    >
      <app-foto
        descripcion="Jugadores del club con sus premios, en un collage frente a los pendones del club"
        src="/fotos/torneo.jpg"
        proporcion="16/9"
        [prioritaria]="true"
        claseCaja="min-h-[22rem]"
      />
      <div
        class="absolute inset-0 velo-foto"
        aria-hidden="true"
      ></div>

      <div
        class="absolute inset-0 flex flex-col justify-end gap-3 py-6 px-sangre-6 text-on-campo
               texto-sobre-foto sm:py-10 sm:px-sangre-10"
      >
        <h1 id="torneos" class="titular text-6xl sm:text-7xl lg:text-8xl">Torneos</h1>
        <p class="max-w-prose text-lg text-on-campo/90">
          Compite en el club, seas socio o no: inscríbete en línea, mira cuántos cupos
          quedan y sigue el cuadro de cada torneo.
        </p>
      </div>
    </section>

    <!-- **La vuelta desde la pasarela se cuenta acá.** Sin esto, quien pagaba volvía
         a la lista sin una palabra y no sabía si había quedado inscrito; y quien
         anulaba se iba creyendo que sí. -->
    @if (resultadoDelPago(); as aviso) {
      <app-aviso id="resultado-del-pago" [variante]="aviso.variante" class="mt-4 block">
        {{ aviso.texto }}
      </app-aviso>
    }

    <!-- Lo que viene de la API va en @defer (T363, SPEC-seo.md D1): el HTML del build
         trae el esqueleto, no un error de carga. -->
    @defer (on immediate) {
      @if (torneos.error()) {
        <p class="mt-6 text-destructive">
          No se pudo cargar el calendario de torneos. Reintenta en un momento.
        </p>
      } @else if (torneos.value(); as lista) {
        @if (lista.length === 0) {
          <app-estado-vacio
            class="mt-6 block"
            icono="emoji_events"
            titulo="Todavía no hay torneos este año"
            detalle="El calendario se publica acá en cuanto el club lo cierra."
          />
        } @else {
          <ul class="mt-8 grid gap-6">
            @for (torneo of lista; track torneo.id) {
              <li class="aparece-al-pasar">
                <!-- EL CARTEL (T315, D3): el afiche a la izquierda, que es lo que invita a
                     inscribirse, y lo del torneo a la derecha, como en la portada. El estado
                     lo dice la insignia. -->
                <app-cartel-del-torneo [nombre]="torneo.nombre" [afiches]="torneo.afiches">
                  <div class="flex flex-wrap items-center gap-2">
                    <mat-chip-set class="insignias">
                      <mat-chip
                        class="insignia"
                        [class]="aceptaInscripciones(torneo) ? 'libre' : 'neutro'"
                      >
                        <mat-icon matChipAvatar aria-hidden="true">flag</mat-icon>
                        {{ nombreEstado(torneo) }}
                      </mat-chip>
                    </mat-chip-set>
                  </div>

                  <h2 class="titular mt-3 text-4xl sm:text-5xl">{{ torneo.nombre }}</h2>

                  <p class="mt-2 text-muted-foreground">
                    {{ enPalabras(torneo.fechaInicio) }}–{{ enPalabras(torneo.fechaFin) }}
                    @if (torneo.superficie) {
                      · {{ superficie(torneo.superficie) }}
                    }
                  </p>
                  <!-- Para qué tours suma (U6), con el enlace a cada uno. -->
                  @if (torneo.tours.length > 0) {
                    <p class="mt-1">
                      Suma para
                      @for (tour of torneo.tours; track tour.tourId) {
                        el
                        <a [routerLink]="['/tours', tour.tourId]" class="font-semibold underline">{{
                          tour.tour
                        }}</a>
                        ({{ tour.nivel }}){{ separador($index, $count) }}
                      }
                    </p>
                  }
                  @if (aceptaInscripciones(torneo)) {
                    <p class="mt-1 font-semibold">
                      Inscripción hasta el {{ enPalabras(torneo.cierreInscripcion) }}.
                    </p>
                  } @else if (torneo.estado === 'INSCRIPCION') {
                    <p class="mt-1">
                      La inscripción cerró el {{ enPalabras(torneo.cierreInscripcion) }}.
                    </p>
                  }

                  <!-- **Una fila por categoría y no una del torneo.** Honor cierra con
                       8 y la 4ª con 32: "quedan 3 cupos" sin decir de qué categoría no
                       le sirve a nadie para saber si se puede inscribir. Y el precio es
                       de cada categoría: Honor puede costar el doble que la 5ª el mismo
                       fin de semana. -->
                  @if (torneo.categorias.length === 0) {
                    <p class="mt-5 text-sm text-muted-foreground">
                      Todavía no se anunciaron las categorías.
                    </p>
                  } @else {
                    <!-- Una tabla de posiciones (TV4.2). Con cuatro columnas puede no
                         caber en un teléfono, y se desplaza adentro, no la página. -->
                    <div class="mt-5 overflow-x-auto">
                      <!-- En el teléfono, menos relleno por celda: con el de siempre
                           (1rem por lado), cuatro columnas no caben en 296px. -->
                      <table
                        mat-table
                        [attr.aria-label]="'Categorías de ' + torneo.nombre"
                        class="max-sm:[&_td]:px-1.5 max-sm:[&_th]:px-1.5"
                        [dataSource]="torneo.categorias"
                      >
                        <ng-container matColumnDef="categoria">
                          <th mat-header-cell *matHeaderCellDef scope="col">Categoría</th>
                          <td
                            mat-cell
                            *matCellDef="let categoria"
                            class="font-display text-xl font-extrabold text-primary sm:text-2xl"
                          >
                            {{ categoria.categoria }}
                          </td>
                        </ng-container>
                        <ng-container matColumnDef="inscripcion">
                          <th mat-header-cell *matHeaderCellDef scope="col">Inscripción</th>
                          <td mat-cell *matCellDef="let categoria">
                            {{ precio(categoria.montoClp) }}
                          </td>
                        </ng-container>
                        <ng-container matColumnDef="cupos">
                          <th mat-header-cell *matHeaderCellDef scope="col">Cupos</th>
                          <td mat-cell *matCellDef="let categoria">
                            <!-- «null»: bajo el 80 % del cupo no se dice cuántos (T374),
                                 y mientras tanto siempre quedan. -->
                            @if (categoria.armado) {
                              cuadro armado
                            } @else if (categoria.cuposLibres === null) {
                              hay cupos
                            } @else if (categoria.cuposLibres > 0) {
                              quedan {{ categoria.cuposLibres }}
                              {{ categoria.cuposLibres === 1 ? 'cupo' : 'cupos' }} de
                              {{ categoria.cupo }}
                            } @else {
                              <span class="font-semibold text-warning-strong">
                                sin cupos, se entra en lista de espera
                              </span>
                            }
                          </td>
                        </ng-container>
                        <ng-container matColumnDef="cuadro">
                          <th mat-header-cell *matHeaderCellDef scope="col">Cuadro</th>
                          <td mat-cell *matCellDef="let categoria">
                            @if (categoria.armado) {
                              cuadro armado
                            }
                          </td>
                        </ng-container>
                        <ng-container matColumnDef="ver">
                          <th mat-header-cell *matHeaderCellDef scope="col">
                            <span class="sr-only">Quiénes juegan</span>
                          </th>
                          <td mat-cell *matCellDef="let categoria" class="numero">
                            <!-- En el teléfono, solo el ícono: con su texto se partía en
                                 dos líneas y la tabla no cabía igual. El nombre sigue
                                 siendo el texto, para el lector y para el inventario. -->
                            <!-- Abre el modal de la categoría (T135): quiénes juegan
                                 antes de armar, el cuadro después. -->
                            <button
                              matButton="outlined"
                              type="button"
                              class="chico max-sm:size-11 max-sm:p-0"
                              aria-haspopup="dialog"
                              (click)="abrir(categoria.id)"
                            >
                              <span class="max-sm:sr-only">
                                {{ categoria.armado ? 'Ver el cuadro' : 'Ver quiénes juegan' }}
                              </span>
                              <mat-icon
                                iconPositionEnd
                                class="text-xl sm:hidden"
                                aria-hidden="true"
                              >
                                {{ categoria.armado ? 'account_tree' : 'groups' }}
                              </mat-icon>
                            </button>
                          </td>
                        </ng-container>

                        <!-- Con la inscripción abierta se dice cuánto cuesta y cuántos
                             cupos quedan; después, si el cuadro ya está armado. -->
                        <tr
                          mat-header-row
                          *matHeaderRowDef="
                            aceptaInscripciones(torneo) ? EN_INSCRIPCION : DESPUES;
                            sticky: true
                          "
                        ></tr>
                        <tr
                          mat-row
                          *matRowDef="
                            let categoria;
                            columns: aceptaInscripciones(torneo) ? EN_INSCRIPCION : DESPUES
                          "
                        ></tr>
                      </table>
                    </div>
                  }

                  <!-- La inscripción es su página (T316, D4), con sus pasos: un enlace y no un
                       botón que desplegaba el formulario en la tarjeta. -->
                  @if (aceptaInscripciones(torneo) && torneo.categorias.length > 0) {
                    <a
                      matButton="filled"
                      class="mt-4 self-start"
                      [routerLink]="['/torneos', torneo.id, 'inscripcion']"
                    >
                      Inscribirme
                      <span class="sr-only">en {{ torneo.nombre }}</span>
                    </a>
                  }
                </app-cartel-del-torneo>
              </li>
            }
          </ul>
        }
      } @else if (torneos.isLoading()) {
        <app-esqueleto class="mt-6 block" [filas]="3" etiqueta="Cargando el calendario…" />
      }
    } @placeholder {
      <app-esqueleto class="mt-6 block" [filas]="3" etiqueta="Cargando el calendario…" />
    }

    <!-- Uno para toda la página: se abre con la categoría que se elija, o con la que
         traiga la dirección en ?cuadro=. -->
    <app-cuadro-publico [cuadroId]="abierto()" (cerrar)="cerrar()" />
  `,
})
export class TorneosPublicos {
  /**
   * MatButton se usa solo dentro del @defer: sin nombrarlo acá, Angular lo difiere con un import()
   * de @angular/material/button entero, y como esa librería ya está en el arranque, ahí queda completa, sin
   * poda (unos 15 kB, T363). Nombrado en la clase, se carga como siempre.
   */
  protected readonly sinDiferir = [MatButton];

  /** Las columnas de las categorías: con la inscripción abierta, y después. */
  protected readonly EN_INSCRIPCION = ['categoria', 'inscripcion', 'cupos', 'ver'];
  protected readonly DESPUES = ['categoria', 'cuadro', 'ver'];

  private readonly api = inject(Torneos);
  private readonly router = inject(Router);

  /**
   * Volvió de la pasarela sin pagar y le soltamos el cupo.
   *
   * Es el caso que **ningún aviso del servidor cubre**: apretar "atrás" en el navegador
   * no pasa por el retorno, así que no hay `?pago=` en la URL ni callback que avise.
   * Desde T316 se va a pagar desde la página de la inscripción, que es a la que se
   * vuelve; acá queda para borrar la marca cuando Webpay trae de vuelta con `?pago=`.
   */
  private readonly volvioSinPagar = signal(false);

  constructor() {
    // Poner esto en `true` hace dos cosas: escribe el aviso y vuelve a pedir el
    // calendario, porque el recurso lo tiene de parámetro.
    soltarSiVolvioSinPagar(() => this.volvioSinPagar.set(true));

    // Los torneos abiertos, como eventos para Google (T358).
    const club = inject(Club).datos;
    publicar('torneos', () =>
      this.torneos.hasValue() ? eventosDeTorneos(this.torneos.value(), club()) : null,
    );

    // **Lo hecho se confirma con el snackbar** (T324, S2), como «Hora tomada» en la agenda: el
    // pago de Webpay, el comprobante recibido o la inscripción gratis. `?pago=` se queda en la
    // dirección: sacarlo con el router, recién llegada la página, cortaba su transición.
    const snackBar = inject(MatSnackBar);
    effect(() => {
      const aviso = AVISOS_DEL_PAGO[this.pago() ?? ''];
      if (aviso?.variante !== 'exito') return;

      untracked(() => snackBar.open(aviso.texto, undefined, LO_HECHO));
    });

    // **El aviso que hay que leer, a la vista** (T323), venga de la vuelta de Webpay o del
    // formulario: en el escritorio, el hero lo dejaba bajo el borde de la pantalla.
    // jsdom no implementa scrollIntoView: en las pruebas, la página queda donde está.
    const anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);
    const injector = inject(Injector);
    effect(() => {
      if (!this.resultadoDelPago()) return;
      afterNextRender(
        () =>
          anfitrion.nativeElement
            .querySelector('#resultado-del-pago')
            ?.scrollIntoView?.({ block: 'center' }),
        { injector },
      );
    });
  }

  protected readonly torneos = resource({
    // **Soltar un cupo deja vieja la lista que se está mostrando**, y el suyo es uno de
    // los que cambió. Va como parámetro y no como un `reload()` suelto porque
    // `reload()` no hace nada si el recurso todavía está cargando —que es exactamente
    // lo que pasa acá: las dos cosas arrancan juntas al abrir la página—.
    params: () => this.volvioSinPagar(),
    loader: () => this.api.calendario(),
  });

  protected readonly enPalabras = diaEnPalabras;
  protected readonly superficie = nombreDeSuperficie;

  /** El precio de una categoría. Cero es gratis y se dice con la palabra. */
  /**
   * El valor de la inscripción, sin la palabra: desde TV4.2 va bajo la columna
   * "Inscripción", y repetirla costaba el ancho que en un teléfono no hay.
   */
  protected precio(montoClp: number): string {
    return montoClp > 0 ? enPesos(montoClp) : 'gratis';
  }

  /**
   * El cuadro que llega por la dirección, `?cuadro=<id>` (T135): es el enlace del correo
   * de "cuadro armado". Llega como input por `withComponentInputBinding`, como
   * `inscripcion`.
   */
  readonly cuadro = input<string>();

  /**
   * Qué categoría tiene el modal abierto. Arranca en la de la dirección y desde ahí la
   * manda quien aprieta el botón; la dirección la sigue, para que se pueda compartir.
   */
  protected readonly abierto = linkedSignal<number | null>(
    () => Number(this.cuadro()) || null,
  );

  protected abrir(id: number): void {
    this.abierto.set(id);
    this.enLaDireccion(id);
  }

  protected cerrar(): void {
    if (this.abierto() === null) return;

    this.abierto.set(null);
    this.enLaDireccion(null);
  }

  /**
   * `?cuadro=<id>` en la dirección, **sin sumar una entrada al historial**: abrir y cerrar
   * un modal no son páginas, y "atrás" tiene que sacar a la persona de los torneos.
   */
  private enLaDireccion(cuadro: number | null): void {
    void this.router.navigate([], {
      queryParams: { cuadro },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Cómo terminó el pago, cuando Webpay acaba de traer de vuelta al navegador.
   *
   * `listo`, `rechazado` o `anulado`: lo pone el servidor en la redirección del
   * retorno. Llega como input por `withComponentInputBinding`, como `cuadro`.
   */
  readonly pago = input<string>();

  /**
   * El aviso fijo de cómo terminó la inscripción: el que hay que leer antes de seguir.
   *
   * **Los dos finales importan por igual.** Que el pago salió bien hay que decirlo, y
   * que no salió, más: el que anula tiene que enterarse de que **no quedó inscrito**,
   * porque su lugar se soltó y el cuadro sigue abierto para otro. Lo que confirma algo hecho
   * (variante éxito) no va acá sino al snackbar, como en el resto del sitio (T324, S2).
   */
  protected readonly resultadoDelPago = computed(() => {
    const aviso = this.volvioSinPagar()
      ? AVISOS_DEL_PAGO['anulado']
      : AVISOS_DEL_PAGO[this.pago() ?? ''];

    return aviso && aviso.variante !== 'exito' ? aviso : null;
  });

  /**
   * Lo que va después del nivel: "," entre tours, " y" antes del último, "." al final.
   * Pegado al nivel y no suelto en la plantilla, que dejaría un espacio antes de la coma.
   */
  protected separador(indice: number, total: number): string {
    if (indice === total - 1) return '.';

    return indice === total - 2 ? ' y' : ',';
  }

  /**
   * Lo que dice la insignia. Con el cierre vencido, «Inscripción cerrada» aunque el estado siga en
   * inscripción hasta que se arme el cuadro (T321): la API ya no acepta a nadie.
   */
  protected nombreEstado(torneo: TorneoPublico): string {
    if (torneo.estado === 'INSCRIPCION' && !aceptaInscripciones(torneo)) {
      return 'Inscripción cerrada';
    }
    return ESTADOS_TORNEO[torneo.estado] ?? torneo.estado;
  }

  protected readonly aceptaInscripciones = aceptaInscripciones;

}
