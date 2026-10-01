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

import { diaEnPalabras, enPesos } from '../../catalogo-canchas/reloj-del-club';
import { nombreDeSuperficie } from '../../catalogo-canchas/superficies';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
// Alias: `torneos.service` ya exporta un tipo `Foto`, que son las de la
// galería del torneo. Este es el componente que reserva el hueco de una
// foto del sitio mientras el club no la entrega.
import { Foto as FotoDelSitio } from '../../ui/foto';
import { Insignia } from '../../ui/insignia';
import { Galeria } from './galeria';
import { InscripcionATorneo } from './inscripcion';
import { olvidarPagoPendiente } from './pago-pendiente';
import { Reproductor } from './reproductor';
import {
  CuadroPublico,
  ESTADOS_TORNEO,
  EstadoTorneo,
  Foto,
  PartidoPublico,
  Transmision,
  Torneos,
} from '../torneos.service';

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
    EstadoVacio,
    Galeria,
    Insignia,
    InscripcionATorneo,
    Reproductor,
  ],
  template: `
    <section
      class="relative isolate -mx-4 overflow-hidden sm:mx-0 sm:rounded-region"
      aria-labelledby="torneos"
    >
      <app-foto
        descripcion="La entrega de premios de un torneo, con los finalistas y el público"
        proporcion="16/9"
        [prioritaria]="true"
        claseCaja="min-h-[22rem]"
      />
      <div
        class="absolute inset-0 bg-gradient-to-t from-campo via-campo/90 to-campo/65"
        aria-hidden="true"
      ></div>

      <div class="absolute inset-0 flex flex-col justify-end gap-3 p-6 text-on-campo sm:p-10">
        <h1 id="torneos" class="font-display text-4xl font-black tracking-tight sm:text-6xl">
          Torneos
        </h1>
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

    @if (torneos.value(); as lista) {
      @if (lista.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="emoji_events"
          titulo="Todavía no hay torneos este año"
          detalle="El calendario se publica acá en cuanto el club lo cierra."
        />
      } @else {
        <!-- Sin cajas: el torneo abierto se distingue por una barra de color en el
             canto, que es más fuerte que un borde gris alrededor de todo. -->
        <ul class="mt-8 grid gap-4">
          @for (torneo of lista; track torneo.id) {
            <!-- El torneo abierto se distingue por su propio fondo y no por una
                 barra de color en el canto: esa franja es el tell más reconocible
                 de una interfaz generada. El verde suave dice lo mismo. -->
            <li
              class="rounded-caja p-5"
              [class.bg-accent-soft]="torneo.estado === 'INSCRIPCION'"
              [class.bg-muted]="torneo.estado !== 'INSCRIPCION'"
            >
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 class="font-display text-2xl font-bold">{{ torneo.nombre }}</h2>
                <app-insignia variante="info" icono="emoji_events">
                  {{ torneo.categoria }}
                </app-insignia>
                <app-insignia
                  [variante]="torneo.estado === 'INSCRIPCION' ? 'exito' : 'neutro'"
                  icono="flag"
                >
                  {{ nombreEstado(torneo.estado) }}
                </app-insignia>
              </div>

              <p class="mt-1 text-sm text-muted-foreground">
                {{ enPalabras(torneo.fechaInicio) }}–{{ enPalabras(torneo.fechaFin) }}
                @if (torneo.superficie) {
                  · {{ superficie(torneo.superficie) }}
                }
              </p>

              <!-- **Una línea por categoría y no una del torneo.** Honor cierra con
                   8 y la 4ª con 32: "quedan 3 cupos" sin decir de qué categoría no le
                   sirve a nadie para saber si se puede inscribir. -->
              @if (torneo.categorias.length === 0) {
                <p class="mt-1 text-sm text-muted-foreground">
                  Todavía no se anunciaron las categorías.
                </p>
              } @else {
                <ul class="mt-2 grid gap-1">
                  @for (categoria of torneo.categorias; track categoria.id) {
                    <li class="text-sm">
                      <strong>{{ categoria.categoria }}</strong>
                      <!-- **Cuánto cuesta cada categoría, no cuánto cuesta el
                           torneo.** Honor puede costar el doble que la 5ª el mismo
                           fin de semana, y el precio es lo que se pregunta justo
                           después de si quedan cupos. -->
                      @if (torneo.estado === 'INSCRIPCION') {
                        · {{ precio(categoria.montoClp) }}
                      }
                      @if (torneo.estado === 'INSCRIPCION' && !categoria.armado) {
                        @if (categoria.cuposLibres > 0) {
                          · quedan {{ categoria.cuposLibres }}
                          {{ categoria.cuposLibres === 1 ? 'cupo' : 'cupos' }} de
                          {{ categoria.cupo }}
                        } @else {
                          · sin cupos, se entra en lista de espera
                        }
                      } @else if (categoria.armado) {
                        · cuadro armado
                      }
                      <button
                        type="button"
                        class="boton boton-secundario boton-chico ms-2"
                        [attr.aria-expanded]="abierto() === categoria.id"
                        (click)="alternar(categoria.id)"
                      >
                        {{
                          abierto() === categoria.id
                            ? 'Ocultar'
                            : 'Ver quiénes juegan'
                        }}
                      </button>
                    </li>
                  }
                </ul>
              }

              @if (torneo.estado === 'INSCRIPCION') {
                <p class="mt-1 text-sm text-muted-foreground">
                  Inscripción hasta el {{ enPalabras(torneo.cierreInscripcion) }}.
                </p>

                @if (torneo.categorias.length > 0) {
                  <button
                    type="button"
                    class="boton boton-primario boton-chico mt-2"
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
              }

              <!-- Se comprueba de quién es el cuadro que se tiene en la mano: al
                   cambiar de torneo se conserva el anterior hasta que llega el nuevo,
                   y sin esto la tarjeta del segundo dibujaba el del primero con el
                   nombre equivocado encima. -->
              @for (categoria of torneo.categorias; track categoria.id) {
                @if (detalleDe(categoria.id); as detalle) {
                @if (detalle.partidos.length === 0) {
                  <div class="mt-3 rounded-lg border border-border bg-background p-3">
                    <h3 class="text-sm font-semibold">Inscritos</h3>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {{ detalle.inscritos.join(', ') || 'Todavía nadie.' }}
                    </p>
                  </div>
                } @else {
                  <!-- En columnas que se desplazan de lado y no una tabla que se
                       encoge: en 375px una tabla de cuatro rondas queda ilegible, y
                       este cuadro se mira sobre todo desde el teléfono, en el club. -->
                  <div class="mt-3 flex gap-3 overflow-x-auto pb-2">
                    @for (ronda of porRonda(); track ronda.numero) {
                      <div class="min-w-48 shrink-0">
                        <h3 class="text-sm font-semibold text-muted-foreground">
                          {{ ronda.nombre }}
                        </h3>
                        <ul class="mt-2 grid gap-2">
                          @for (partido of ronda.partidos; track partido.posicion) {
                            <li
                              class="rounded-lg border border-border bg-background p-2
                                     text-sm"
                            >
                              <p [class.font-semibold]="ganoEl(partido, partido.jugadorA)">
                                {{ partido.jugadorA ?? vacio(partido) }}
                              </p>
                              <p [class.font-semibold]="ganoEl(partido, partido.jugadorB)">
                                {{ partido.jugadorB ?? vacio(partido) }}
                              </p>
                              @if (partido.marcador) {
                                <p class="text-xs text-muted-foreground">
                                  {{ partido.marcador }}
                                </p>
                              }
                              @if (partido.walkover) {
                                <p class="text-xs text-muted-foreground">
                                  No se presentó
                                </p>
                              }
                            </li>
                          }
                        </ul>
                      </div>
                    }
                  </div>
                }
                }
              }

              <!-- Los lives, debajo del cuadro del torneo que se está mirando. El
                   requisito es verlos acá y no en YouTube, y el reproductor no carga
                   nada de Google hasta que alguien aprieta play. -->
              @if (torneoAbierto() === torneo.id) {
                <app-galeria [fotos]="fotos.value()" />
              }

              @if (torneoAbierto() === torneo.id && transmisiones.value().length > 0) {
                <div class="mt-3">
                  <h3 class="text-sm font-semibold">En vivo</h3>
                  <div class="grid gap-3 sm:grid-cols-2">
                    @for (transmision of transmisiones.value(); track transmision.id) {
                      <app-reproductor [transmision]="transmision" />
                    }
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      }
    } @else if (torneos.isLoading()) {
      <p class="mt-6 text-muted-foreground">Cargando el calendario…</p>
    }
  `,
})
export class TorneosPublicos {
  private readonly api = inject(Torneos);

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

  /**
   * Qué **cuadro** está abierto. Uno a la vez: el año entero no cabe en la pantalla.
   *
   * Es el id de la categoría del torneo y no el del torneo (T62): un torneo corre
   * varias y hay que decir cuál se está mirando.
   */
  protected readonly abierto = signal<number | null>(null);

  /**
   * Los lives del torneo abierto.
   *
   * Cuelgan del torneo y no del cuadro: el mismo live cubre las categorías que se
   * jueguen en esa cancha ese día.
   */
  protected readonly transmisiones = resource({
    params: () => this.torneoAbierto(),
    loader: ({ params }) =>
      params === null
        ? Promise.resolve([])
        : this.api.transmisionesPublicas(params),
    defaultValue: [] as Transmision[],
  });

  /**
   * Las fotos del torneo abierto (T69).
   *
   * Del torneo y no del cuadro: la entrega de premios es del torneo entero, y una
   * galería por categoría partiría en tres el álbum de un mismo fin de semana.
   */
  protected readonly fotos = resource({
    params: () => this.torneoAbierto(),
    loader: ({ params }) =>
      params === null ? Promise.resolve([]) : this.api.fotos(params),
    defaultValue: [] as Foto[],
  });

  /** De qué torneo es el cuadro que se está mirando. */
  protected readonly torneoAbierto = computed(
    () => this.cuadro.value()?.torneoId ?? null,
  );

  protected readonly cuadro = resource({
    params: () => this.abierto(),
    loader: ({ params }) =>
      params === null
        ? Promise.resolve(undefined)
        : this.api.cuadroPublico(params),
  });

  protected readonly porRonda = computed(() => {
    const partidos = this.cuadro.value()?.partidos ?? [];
    const rondas = new Map<number, PartidoPublico[]>();

    for (const partido of partidos) {
      rondas.set(partido.ronda, [...(rondas.get(partido.ronda) ?? []), partido]);
    }

    return [...rondas].map(([numero, suyos]) => ({
      numero,
      nombre: suyos[0].ronda_nombre,
      partidos: suyos,
    }));
  });

  protected readonly enPalabras = diaEnPalabras;
  protected readonly superficie = nombreDeSuperficie;

  /** El precio de una categoría. Cero es gratis y se dice con la palabra. */
  protected precio(montoClp: number): string {
    return montoClp > 0 ? `inscripción ${enPesos(montoClp)}` : 'inscripción gratis';
  }

  /**
   * El cuadro abierto, **solo si es el de esta categoría**.
   *
   * Al cambiar de cuadro se conserva el anterior hasta que llega el nuevo, y sin esta
   * comprobación la tarjeta del segundo dibujaba el del primero con el nombre
   * equivocado encima.
   */
  protected detalleDe(cuadroId: number): CuadroPublico | null {
    const detalle = this.cuadro.value();

    return this.abierto() === cuadroId && detalle?.id === cuadroId
      ? detalle
      : null;
  }

  protected alternar(id: number): void {
    this.abierto.update((actual) => (actual === id ? null : id));
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

  /** Un hueco de primera ronda es un bye; en las demás, todavía no se sabe. */
  protected vacio(partido: PartidoPublico): string {
    return partido.ronda === 1 ? 'Bye' : 'Por definir';
  }

  /**
   * Si ese jugador ganó el partido.
   *
   * Se compara por nombre y no por id: la respuesta pública no trae ids de jugadores,
   * y no los trae a propósito —lo que se publica es quién jugó, no la ficha de nadie—.
   */
  protected ganoEl(partido: PartidoPublico, jugador: string | null): boolean {
    return jugador !== null && partido.ganador === jugador;
  }
}
