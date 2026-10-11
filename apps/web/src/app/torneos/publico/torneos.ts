import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { diaEnPalabras, enPesos } from '../../catalogo-canchas/reloj-del-club';
import { nombreDeSuperficie } from '../../catalogo-canchas/superficies';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
// Alias: `torneos.service` ya exporta un tipo `Foto`, que son las de la
// galería del torneo. Este es el componente que reserva el hueco de una
// foto del sitio mientras el club no la entrega.
import { Foto as FotoDelSitio } from '../../ui/foto';
import { Insignia } from '../../ui/insignia';
import { CuadroPublicoModal } from './cuadro-publico';
import { InscripcionATorneo } from './inscripcion';
import { olvidarPagoPendiente } from './pago-pendiente';
import { ESTADOS_TORNEO, EstadoTorneo, Torneos } from '../torneos.service';

/**
 * Lo que se le dice a quien vuelve de la pasarela.
 *
 * **Los dos finales importan por igual**: que el pago entró hay que decirlo, y que no
 * entró, más — esa persona tiene que enterarse de que **no quedó inscrita**, porque su
 * lugar se soltó y el cuadro sigue abierto para otro.
 */
const AVISOS: Record<string, { variante: 'exito' | 'error'; texto: string }> = {
  listo: {
    variante: 'exito',
    texto: 'Pago recibido: tu inscripción quedó confirmada. Nos vemos en la cancha.',
  },
  rechazado: {
    variante: 'error',
    texto:
      'El pago fue rechazado, así que tu inscripción no quedó tomada. Puedes ' +
      'inscribirte de nuevo con otro medio de pago.',
  },
  anulado: {
    variante: 'error',
    texto:
      'No terminaste el pago, así que tu inscripción no quedó tomada y tu cupo ' +
      'volvió a estar disponible. Puedes inscribirte de nuevo.',
  },
};

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
    FotoDelSitio,
    Aviso,
    CuadroPublicoModal,
    EstadoVacio,
    Insignia,
    InscripcionATorneo,
  ],
  template: `
    <section
      class="relative isolate -mx-4 overflow-hidden sm:mx-0 sm:rounded-region"
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
        class="absolute inset-0 flex flex-col justify-end gap-3 p-6 text-on-campo texto-sobre-foto
               sm:p-10"
      >
        <h1 id="torneos" class="titular text-6xl sm:text-7xl lg:text-8xl">Torneos</h1>
        <p class="max-w-prose text-lg text-on-campo/90">
          Lo que se juega este año en el club: cuándo es cada torneo, cuántos cupos
          quedan y cómo va el cuadro.
        </p>
      </div>
    </section>

    <!-- **La vuelta desde la pasarela se cuenta acá.** Sin esto, quien pagaba volvía
         a la lista sin una palabra y no sabía si había quedado inscrito; y quien
         anulaba se iba creyendo que sí. -->
    @if (resultadoDelPago(); as aviso) {
      <app-aviso [variante]="aviso.variante" class="mt-4 block">
        {{ aviso.texto }}
      </app-aviso>
    }

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
            <li class="overflow-hidden bg-card shadow-md">
              <!-- EL CARTEL (TV4.2). El torneo abierto va sobre el campo, que es lo
                   que se mira primero; los demás, sobre gris. El estado no depende
                   solo del color: lo dice la insignia. -->
              <div
                class="p-5 sm:p-7"
                [class.bg-campo]="torneo.estado === 'INSCRIPCION'"
                [class.text-on-campo]="torneo.estado === 'INSCRIPCION'"
                [class.bg-muted]="torneo.estado !== 'INSCRIPCION'"
              >
                <!-- Insignias de fondo sólido: las translúcidas no se leen sobre el
                     campo (lo midió TV3.4). -->
                <div class="flex flex-wrap items-center gap-2">
                  <app-insignia
                    [variante]="torneo.estado === 'INSCRIPCION' ? 'libre' : 'neutro'"
                    icono="flag"
                  >
                    {{ nombreEstado(torneo.estado) }}
                  </app-insignia>
                  <!-- Sin categoría de torneo, sin insignia: quedaba el puro ícono. -->
                  @if (torneo.categoria) {
                    <app-insignia variante="neutro" icono="emoji_events">
                      {{ torneo.categoria }}
                    </app-insignia>
                  }
                </div>

                <h2 class="titular mt-3 text-4xl sm:text-5xl">{{ torneo.nombre }}</h2>

                <p class="mt-2 opacity-85">
                  {{ enPalabras(torneo.fechaInicio) }}–{{ enPalabras(torneo.fechaFin) }}
                  @if (torneo.superficie) {
                    · {{ superficie(torneo.superficie) }}
                  }
                </p>
                @if (torneo.estado === 'INSCRIPCION') {
                  <p class="mt-1 font-semibold">
                    Inscripción hasta el {{ enPalabras(torneo.cierreInscripcion) }}.
                  </p>
                }
              </div>

              <div class="p-4 sm:p-7">
                <!-- **Una fila por categoría y no una del torneo.** Honor cierra con
                     8 y la 4ª con 32: "quedan 3 cupos" sin decir de qué categoría no
                     le sirve a nadie para saber si se puede inscribir. Y el precio es
                     de cada categoría: Honor puede costar el doble que la 5ª el mismo
                     fin de semana. -->
                @if (torneo.categorias.length === 0) {
                  <p class="text-sm text-muted-foreground">
                    Todavía no se anunciaron las categorías.
                  </p>
                } @else {
                  <!-- Una tabla de posiciones (TV4.2). Con cuatro columnas puede no
                       caber en un teléfono, y se desplaza adentro, no la página. -->
                  <div class="overflow-x-auto">
                    <!-- En el teléfono, menos relleno por celda: con el de siempre
                         (1rem por lado), cuatro columnas no caben en 296px. -->
                    <table class="tabla max-sm:[&_td]:px-1.5 max-sm:[&_th]:px-1.5">
                      <caption class="sr-only">
                        Categorías de {{ torneo.nombre }}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Categoría</th>
                          @if (torneo.estado === 'INSCRIPCION') {
                            <th scope="col">Inscripción</th>
                            <th scope="col">Cupos</th>
                          } @else {
                            <th scope="col">Cuadro</th>
                          }
                          <th scope="col"><span class="sr-only">Quiénes juegan</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (categoria of torneo.categorias; track categoria.id) {
                          <tr>
                            <td
                              class="font-display text-xl font-extrabold text-primary
                                     sm:text-2xl"
                            >
                              {{ categoria.categoria }}
                            </td>
                            @if (torneo.estado === 'INSCRIPCION') {
                              <td>{{ precio(categoria.montoClp) }}</td>
                              <td>
                                @if (categoria.armado) {
                                  cuadro armado
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
                            } @else {
                              <td>
                                @if (categoria.armado) {
                                  cuadro armado
                                }
                              </td>
                            }
                            <td class="numero">
                              <!-- En el teléfono, solo el ícono: con su texto se partía en
                                   dos líneas y la tabla no cabía igual. El nombre sigue
                                   siendo el texto, para el lector y para el inventario. -->
                              <!-- Abre el modal de la categoría (T135): quiénes juegan
                                   antes de armar, el cuadro después. -->
                              <button
                                type="button"
                                class="boton boton-secundario boton-chico max-sm:size-11 max-sm:p-0"
                                aria-haspopup="dialog"
                                (click)="abrir(categoria.id)"
                              >
                                <span class="max-sm:sr-only">
                                  {{ categoria.armado ? 'Ver el cuadro' : 'Ver quiénes juegan' }}
                                </span>
                                <span class="icono text-xl sm:hidden" aria-hidden="true">
                                  {{ categoria.armado ? 'account_tree' : 'groups' }}
                                </span>
                              </button>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }

                @if (torneo.estado === 'INSCRIPCION' && torneo.categorias.length > 0) {
                  <button
                    type="button"
                    class="boton boton-primario mt-4"
                    [attr.aria-expanded]="inscribiendo() === torneo.id"
                    (click)="alternarInscripcion(torneo.id)"
                  >
                    {{
                      inscribiendo() === torneo.id
                        ? 'Cerrar la inscripción'
                        : 'Inscribirme'
                    }}
                  </button>

                  @if (inscribiendo() === torneo.id) {
                    <app-inscripcion-a-torneo
                      [torneoId]="torneo.id"
                      [categorias]="torneo.categorias"
                      [inscrito]="recargar"
                    />
                  }
                }
              </div>
            </li>
          }
        </ul>
      }
    } @else if (torneos.isLoading()) {
      <p class="mt-6 text-muted-foreground">Cargando el calendario…</p>
    }

    <!-- Uno para toda la página: se abre con la categoría que se elija, o con la que
         traiga la dirección en ?cuadro=. -->
    <app-cuadro-publico [cuadroId]="abierto()" (cerrar)="cerrar()" />
  `,
})
export class TorneosPublicos {
  private readonly api = inject(Torneos);
  private readonly router = inject(Router);

  constructor() {
    void this.soltarSiVolvioSinPagar();

    // `pageshow` y no solo el arranque: al volver atrás, el navegador puede restaurar
    // esta página de su caché sin construir el componente otra vez.
    const alVolver = () => void this.soltarSiVolvioSinPagar();
    window.addEventListener('pageshow', alVolver);
    inject(DestroyRef).onDestroy(() =>
      window.removeEventListener('pageshow', alVolver),
    );
  }

  /**
   * Volvió de la pasarela sin pagar y le soltamos el cupo.
   *
   * Es el caso que **ningún aviso del servidor cubre**: apretar "atrás" en el navegador
   * no pasa por el retorno, así que no hay `?pago=` en la URL ni callback que avise.
   */
  private readonly volvioSinPagar = signal(false);

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
   * El torneo que llega con el formulario ya abierto, desde `?inscripcion=5`.
   *
   * Lo pone el botón "Inscribirme" de la portada. Llega como input y no leyendo la
   * ruta a mano porque el router está configurado con `withComponentInputBinding`.
   */
  readonly inscripcion = input<string>();

  /**
   * Cómo terminó el pago, cuando Webpay acaba de traer de vuelta al navegador.
   *
   * `listo`, `rechazado` o `anulado`: lo pone el servidor en la redirección del
   * retorno. Llega como input por la misma vía que `inscripcion`.
   */
  readonly pago = input<string>();

  /**
   * Qué decirle a quien vuelve de la pasarela.
   *
   * **Los dos finales importan por igual.** Que el pago salió bien hay que decirlo, y
   * que no salió, más: el que anula tiene que enterarse de que **no quedó inscrito**,
   * porque su lugar se soltó y el cuadro sigue abierto para otro.
   */
  protected readonly resultadoDelPago = computed(() =>
    this.volvioSinPagar()
      ? AVISOS['anulado']
      : (AVISOS[this.pago() ?? ''] ?? null),
  );

  /**
   * Si esta pestaña viene de un pago sin terminar, suelta ese cupo.
   *
   * **Se llama al arrancar y en cada `pageshow`.** Volver atrás puede restaurar la
   * página desde el caché del navegador sin construir el componente de nuevo, y ese es
   * justo el caso que esto existe para atender.
   *
   * No se mira `pago()` para decidir si llamar: si la persona pagó, su inscripción ya
   * no está pendiente y el servidor no suelta nada —`soltada: false`— así que la
   * llamada es inofensiva. Mirarlo obligaría a esperar a que el input estuviera puesto,
   * que es una carrera que no hace falta correr.
   */
  private async soltarSiVolvioSinPagar(): Promise<void> {
    const token = olvidarPagoPendiente();

    if (!token) return;

    const { soltada } = await this.api.soltarInscripcion(token);

    // Poner esto en `true` hace dos cosas: escribe el aviso y vuelve a pedir el
    // calendario, porque el recurso lo tiene de parámetro.
    if (soltada) this.volvioSinPagar.set(true);
  }

  /**
   * Qué torneo tiene el formulario de inscripción abierto.
   *
   * `linkedSignal` y no `signal`: arranca en el que pidió la URL y desde ahí lo manda
   * quien aprieta el botón, sin que el valor de la URL vuelva a imponerse.
   */
  protected readonly inscribiendo = linkedSignal<number | null>(
    () => Number(this.inscripcion()) || null,
  );

  protected alternarInscripcion(id: number): void {
    this.inscribiendo.update((actual) => (actual === id ? null : id));
  }

  /**
   * Vuelve a pedir el calendario después de una inscripción.
   *
   * Sin esto, los cupos que quedan siguen diciendo lo de antes justo cuando la persona
   * acaba de cambiarlos. Va como propiedad y no como método para poder pasarla al hijo.
   */
  protected readonly recargar = (): void => {
    this.torneos.reload();
  };

  protected nombreEstado(estado: EstadoTorneo): string {
    return ESTADOS_TORNEO[estado] ?? estado;
  }

}
