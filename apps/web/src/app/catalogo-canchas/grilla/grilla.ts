import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  Directive,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Auth } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { ReportesDelSocio } from '../../reservas/reportes.service';
import { Reservar } from '../../reservas/reservar';
import { BarraFija } from '../../ui/barra-fija';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import {
  BloqueDisponible,
  Cancha,
  Disponibilidad,
  DuracionMin,
} from '../disponibilidad';
import { enPesos, hoyEnElClub, horaEnElClub } from '../reloj-del-club';
import { ICONOS_DE_MOTIVO, nombreDelMotivo } from '../motivos';
import { nombreDeSuperficie } from '../superficies';
import {
  agruparPorHora,
  agruparPorInicio,
  Banda,
  precioDeLaHora,
  TARIFA_DEL_SOCIO,
  yaEmpezo,
} from './bandas';
import { ControlesDelDia, pasaElFiltro } from './controles-del-dia';
import { MoverReserva } from './mover-reserva';
import { ResumenDeLaEleccion } from './resumen-de-la-eleccion';
import { ResumenDelCambio, textoDeLaDiferencia } from './resumen-del-cambio';

/**
 * Le pone tipo al `let-banda` de la plantilla de la banda.
 *
 * Sin esto el `ng-template` le da `any` y el compilador deja de revisar esa
 * parte de la plantilla: en la revisión de TV5.1 un campo inventado,
 * `franja.libresQueNoExisten`, compilaba igual. Con el `@for` de antes eso no
 * pasaba.
 */
@Directive({ selector: 'ng-template[appBandaTipada]' })
export class BandaTipada {
  static ngTemplateContextGuard(
    _directiva: BandaTipada,
    contexto: unknown,
  ): contexto is { $implicit: Banda } {
    // El contexto de un ng-template es siempre un objeto; lo que importa es el
    // tipo que esta firma le da al compilador.
    return typeof contexto === 'object';
  }
}

@Component({
  selector: 'app-grilla',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    BandaTipada,
    Reservar,
    BarraFija,
    ControlesDelDia,
    EstadoVacio,
    Insignia,
    ResumenDeLaEleccion,
    ResumenDelCambio,
  ],
  providers: [MoverReserva],
  host: {
    class: 'block',
    // La barra fija tapa la última fila de bloques si no se le deja aire, y el
    // checklist del master lo prohíbe.
    '[class.pb-28]': 'elegido() !== null',
  },
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Disponibilidad</h1>

    @if (mover.activo()) {
      <!-- Se dice arriba y no en cada bloque: quien llega desde "mis reservas" o desde
           el enlace tiene que saber que el próximo clic mueve su hora en vez de tomar
           una nueva. Y quien pagó, la regla de la plata, antes de elegir (T88). -->
      <p class="mt-3 rounded-lg bg-muted p-3 font-medium">
        Elige la nueva hora para tu reserva. La que tenías queda liberada.
        @if (mover.pagadoPorElEnlace(); as pagado) {
          Pagaste {{ pesos(pagado) }}: si la nueva vale menos, no se devuelve la
          diferencia.
        }
      </p>
    }

    @if (avisoDeReporte(); as aviso) {
      <p role="status" class="mt-3 rounded-lg bg-muted p-3 text-sm font-medium">
        {{ aviso }}
      </p>
    }

    @if (mover.error(); as falla) {
      <p role="alert" class="mt-3 rounded-lg bg-destructive/10 p-3 text-destructive">
        {{ falla }}
      </p>
    }

    <app-controles-del-dia
      [(fecha)]="fecha"
      [duracion]="duracion()"
      [(filtro)]="filtro"
      (cambiarDuracion)="elegirDuracion($event)"
    />

    <!-- Los cambios de estado se anuncian: quien usa lector de pantalla no ve
         que la grilla se repobló. -->
    <div role="status" aria-live="polite" class="mt-6">
      @if (grillas.isLoading()) {
        <p class="text-muted-foreground">Buscando horas disponibles…</p>
      } @else if (grillas.error()) {
        <p class="text-destructive">
          No se pudo cargar la disponibilidad. Reintenta en un momento.
        </p>
      } @else if (grillas.value().length === 0) {
        <p class="text-muted-foreground">El club no tiene canchas publicadas.</p>
      } @else if (visibles().length === 0) {
        <!-- Filtrar hasta quedarse sin nada es un callejón: la salida está acá,
             no en volver a probar los cuatro filtros a ver cuál era. -->
        <app-estado-vacio
          icono="filter_alt_off"
          titulo="Ninguna cancha cumple ese filtro"
          detalle="El club no tiene canchas de ese tipo publicadas hoy."
        >
          <button
            type="button"
            class="boton boton-primario"
            (click)="filtro.set('todas')"
          >
            Ver todas las canchas
          </button>
        </app-estado-vacio>
      } @else if (sinHoraYMediaEnElDia()) {
        <!-- Lo mismo que el filtro que no deja canchas: sin esto eran 27 filas con el
             mismo "no se arrienda", y la salida no estaba en ninguna. -->
        <app-estado-vacio
          icono="schedule"
          titulo="Este día no se arrienda 1 hora y media"
          detalle="El club no la ofrece este día a quien no es socio."
        >
          <button
            type="button"
            class="boton boton-primario"
            (click)="elegirDuracion('60')"
          >
            Ver horas de 1 hora
          </button>
        </app-estado-vacio>
      } @else {
        <!-- Que la carga terminó también hay que decirlo: quien usa lector de
             pantalla oyó "buscando" y después se quedaría en silencio, sin saber
             si la grilla se repobló ni con cuánto. -->
        <p class="sr-only">{{ resumen() }}</p>
      }
    </div>

    <!--
      EL DÍA, POR HORA.

      Cada banda es una hora y dentro van las canchas libres como chips. Antes
      esto eran ocho secciones de catorce tarjetas cada una: 112 tarjetas, 56
      filas en un teléfono, 10.223px de alto para responder "¿a qué hora puedo
      jugar?". El eje lo cambió el club el 2026-09-08 y la razón es la pregunta,
      no el tamaño: agrupada por cancha, esa pregunta obliga a recorrer ocho
      listas y compararlas de memoria.
    -->
    @if (visibles().length > 0 && porHora().length === 0) {
      <!-- Agrupando por hora, un día sin bloques deja la pantalla en blanco: sin
           esto, "el club no abre este día" se leería como una falla de carga. -->
      <p class="mt-6 text-muted-foreground">
        El club no abre este día.
      </p>
    }

    <!-- LAS HORAS QUE YA PASARON, PLEGADAS (decisión 9, TV5.1). A las 18:00 la
         grilla abría con diez filas "Ya pasó" antes de la primera hora tomable.
         No se quitan: ahí está el botón para reportar una hora no usada (T35), y
         el título del grupo avisa cuando hay alguna. <details> y no un botón a
         mano: el desplegable nativo trae el teclado y el estado para el lector. -->
    @if (pasadas().length > 0) {
      <details class="group mt-6 border-t border-border pt-4">
        <summary
          class="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2
                 font-display text-lg font-bold tracking-wide text-muted-foreground uppercase
                 [&::-webkit-details-marker]:hidden"
        >
          <span class="icono transition-transform group-open:rotate-90" aria-hidden="true">
            chevron_right
          </span>
          {{ pasadas().length }}
          {{ pasadas().length === 1 ? 'hora que ya pasó' : 'horas que ya pasaron' }}
          @if (hayQueReportar()) {
            <span class="font-sans text-sm font-semibold tracking-normal normal-case">
              · puedes reportar las que no se usaron
            </span>
          }
        </summary>
        @for (banda of pasadas(); track banda.hora) {
          <ng-container
            [ngTemplateOutlet]="bandaTpl"
            [ngTemplateOutletContext]="{ $implicit: banda }"
          />
        }
      </details>
    }

    @for (banda of sinHoraYMediaEnElDia() ? [] : vigentes(); track banda.hora) {
      <ng-container
        [ngTemplateOutlet]="bandaTpl"
        [ngTemplateOutletContext]="{ $implicit: banda }"
      />
    }

    <!-- Una banda: se escribe una vez y se usa dentro y fuera del pliegue. -->
    <ng-template #bandaTpl appBandaTipada let-banda>
      <section class="mt-6 border-t border-border pt-5">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <!-- La hora en un rótulo de color (TV5.1): campo, o ámbar suave si toda la
               hora es pico. No una franja lateral: esa barra en el canto es el tell
               de interfaz generada que el lint de franjas prohíbe. "08 h" se oye mal;
               el lector oye "A las 8". Relativo por la trampa del sr-only. -->
          <h2 class="relative font-display leading-none">
            <span
              class="rotulo-hora px-2 py-1 text-3xl"
              [class.rotulo-hora-pico]="banda.pico === true"
              aria-hidden="true"
              >{{ banda.hora }} h</span
            >
            <span class="sr-only">{{ banda.nombre }}</span>
          </h2>

          <!-- Lo que los dos inicios dicen igual se dice una vez (T83a). -->
          @if (banda.precioComun || banda.pico === true) {
            <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
              @if (banda.precioComun) {
                <span class="text-muted-foreground">Socio {{ tarifaDelSocio }}</span>
                @if (banda.precio !== null) {
                  <span class="text-muted-foreground" aria-hidden="true">·</span>
                  <span class="text-muted-foreground">
                    Arriendo
                    <strong class="text-accent-strong">{{ banda.precio }}</strong>
                  </span>
                }
              }
              @if (banda.pico === true) {
                <app-insignia variante="aviso" icono="trending_up">Hora pico</app-insignia>
              }
            </p>
          }
        </div>

        @if (banda.enMantencion !== null) {
          <p class="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <span class="icono text-base" aria-hidden="true">build</span>
            {{ banda.enMantencion }} en mantención
          </p>
        }

        @for (franja of banda.franjas; track franja.inicio) {
        <div class="mt-4" [attr.data-inicio]="franja.inicio">
          <!-- Las etiquetas van pegadas a propósito: un salto de línea entre ellas
               mete un espacio en blanco y en pantalla se lee "08:00 –09:00". -->
          <p class="flex flex-wrap items-baseline gap-x-2">
            <span class="font-display text-xl font-bold"
              >{{ hora(franja.inicio) }}–{{ hora(franja.fin) }}</span
            >
            @if (franja.libres.length > 0) {
              <span class="text-sm font-semibold text-accent-strong">
                {{ franja.libres.length }}
                {{ franja.libres.length === 1 ? 'libre' : 'libres' }}
              </span>
              @if (!banda.precioComun) {
                <!-- Este inicio cae en otra franja que su hermano: dice lo suyo. -->
                <span class="text-sm text-muted-foreground">
                  Socio {{ tarifaDelSocio }}
                  @if (precioDeLaHora(franja.libres); as precio) {
                    · Arriendo <strong class="text-accent-strong">{{ precio }}</strong>
                  }
                </span>
              }
            } @else if (franja.soloSocios > 0 && !franja.yaPaso) {
              <!-- Hay canchas libres, pero esta duración no se le vende a quien no es
                   socio: "sin canchas libres" sería falso. -->
              <span class="text-sm font-medium text-muted-foreground">
                No se arrienda por 1 hora y media a esta hora
              </span>
            } @else {
              <span class="text-sm font-medium text-muted-foreground">
                {{ franja.yaPaso ? 'Ya pasó' : 'Sin canchas libres' }}
              </span>
            }
            @if (banda.pico === null && franja.esPico) {
              <app-insignia variante="aviso" icono="trending_up">Hora pico</app-insignia>
            }
          </p>

        @if (franja.libres.length > 0) {
          <ul class="mt-3 flex flex-wrap gap-2">
            @for (libre of franja.libres; track libre.cancha.id; let i = $index) {
              <li class="bloque" [style.--i]="i">
                <!-- El chip libre en el verde de "libre"; el elegido, en rótulo,
                     como la opción marcada del selector (TV2.3 y TV5.1). -->
                <button
                  type="button"
                  class="flex min-h-11 cursor-pointer items-center gap-2 rounded-control
                         border px-3 py-2 font-display text-sm font-bold tracking-wide
                         uppercase transition-colors"
                  [class.border-border]="!estaElegido(libre.bloque)"
                  [class.bg-accent-soft]="!estaElegido(libre.bloque)"
                  [class.text-accent-strong]="!estaElegido(libre.bloque)"
                  [class.border-rotulo]="estaElegido(libre.bloque)"
                  [class.bg-rotulo]="estaElegido(libre.bloque)"
                  [class.text-on-rotulo]="estaElegido(libre.bloque)"
                  [attr.aria-label]="etiqueta(libre.cancha, libre.bloque)"
                  [attr.aria-pressed]="estaElegido(libre.bloque)"
                  (click)="elegir(libre.cancha, libre.bloque)"
                >
                  @if (estaElegido(libre.bloque)) {
                    <span class="icono text-base" aria-hidden="true">check_circle</span>
                  }
                  {{ libre.cancha.nombre }}
                  @if (libre.cancha.techada) {
                    <span class="icono text-base" aria-hidden="true" title="Techada">
                      roofing
                    </span>
                  }
                </button>
              </li>
            }
          </ul>
        }

        <!-- Las horas propias que ya pasaron siguen siendo un elemento con su
             botón, no un número: es la única forma de que el socio pueda decir
             que nadie usó esa cancha (T35). El resto de las ocupadas se cuenta
             abajo. -->
        @for (caso of franja.reportables; track caso.cancha.id) {
          @if (reportable(caso.bloque); as reporte) {
            <div class="mt-3 flex flex-wrap items-center gap-3 rounded-caja bg-muted p-3">
              <span class="font-semibold">{{ caso.cancha.nombre }}</span>
              @if (reporte.yaReportada) {
                <span class="text-sm text-muted-foreground">
                  Ya reportaste esta hora.
                </span>
              } @else {
                <!-- La primitiva y no clases a mano (TV8.2): en 12px y sin .boton no
                     tenía alto táctil ni la confirmación al apretar. -->
                <button
                  type="button"
                  class="boton boton-texto boton-chico"
                  (click)="reportar(reporte.reservaId)"
                >
                  Reportar hora no usada
                  <span class="sr-only">
                    de las {{ hora(caso.bloque.inicio) }} en {{ caso.cancha.nombre }}
                  </span>
                </button>
              }
            </div>
          }
        }

        <!-- Lo que no se puede tomar se cuenta, no se esconde: que a las 19:00
             haya seis ocupadas es información, y borrarla haría que esa hora se
             viera igual que una que el club no abre. -->
        @if (
          franja.ocupadas > 0 ||
          franja.enClase > 0 ||
          franja.enTorneo > 0 ||
          (franja.enMantencion > 0 && banda.enMantencion === null)
        ) {
          <p class="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
            @if (franja.ocupadas > 0) {
              <span class="inline-flex items-center gap-1">
                <span class="icono text-base" aria-hidden="true">lock</span>
                {{ franja.ocupadas }}
                {{ franja.ocupadas === 1 ? 'ocupada' : 'ocupadas' }}
              </span>
            }
            <!-- T97. La clase se nombra y se enlaza: a quien llega nuevo le dice que a esta
                 hora hay una clase que le puede servir. Antes se leía "en mantención". -->
            @if (franja.enClase > 0) {
              <span class="inline-flex items-center gap-1">
                <span class="icono text-base" aria-hidden="true">{{ iconos['CLASE'] }}</span>
                {{ franja.enClase }} en clase ·
                <a routerLink="/clases" class="font-semibold text-primary underline">
                  Ver clases
                </a>
              </span>
            }
            @if (franja.enTorneo > 0) {
              <span class="inline-flex items-center gap-1">
                <span class="icono text-base" aria-hidden="true">{{ iconos['TORNEO'] }}</span>
                {{ franja.enTorneo }} en torneo
              </span>
            }
            @if (franja.enMantencion > 0 && banda.enMantencion === null) {
              <span class="inline-flex items-center gap-1">
                <span class="icono text-base" aria-hidden="true">build</span>
                {{ franja.enMantencion }} en mantención
              </span>
            }
          </p>
        }
        </div>
        }
      </section>
    </ng-template>

    <!-- Elegir y reservar quedaron separados: el bloque se marca y la barra dice qué
         se marcó y con cuánto antes del botón. Desde el enlace, con plata en juego, dice
         la diferencia (T91). -->
    @if (elegido(); as eleccion) {
      @let pagado = mover.pagadoPorElEnlace();
      <app-barra-fija>
        <!-- Por el modo y no por lo pagado: desde el enlace, "Reservar" abriría una reserva
             nueva en vez de cambiar la suya. -->
        @if (mover.porToken() === null) {
          <app-resumen-de-la-eleccion
            [cancha]="eleccion.cancha"
            [bloque]="eleccion.bloque"
            (soltar)="elegido.set(null)"
            (reservar)="reservar()"
          />
        } @else if (pagado !== null) {
          <app-resumen-del-cambio
            [cancha]="eleccion.cancha"
            [bloque]="eleccion.bloque"
            [pagadoClp]="pagado"
            [enviando]="mover.enviando()"
            (soltar)="elegido.set(null)"
            (confirmar)="mover.cambiarPorEnlace(eleccion)"
          />
        }
      </app-barra-fija>
    }

    @if (reservando(); as eleccion) {
      <app-reservar
        [cancha]="eleccion.cancha"
        [bloque]="eleccion.bloque"
        (cerrar)="reservando.set(null)"
        (reservado)="confirmar($event)"
      />
    }
  `,
  styles: `
    /* El stagger de MASTER.md § Motion, en CSS puro: sin dependencia y sin JS en
       el hilo principal. Solo opacity y transform. */
    .bloque {
      transition:
        opacity var(--duracion-entrada),
        transform var(--duracion-entrada);
      transition-timing-function: var(--ease-rebote);
      /* Topeado en 12: con el escalonado por bloque, el número 40 entraría 2,4 s
         después de que la grilla ya está lista. */
      transition-delay: calc(min(var(--i), 12) * var(--escalonado));

      @starting-style {
        opacity: 0;
        transform: translateY(16px) scale(0.92);
      }
    }

    /* Que la tarjeta responde al mouse hay que mostrarlo, no solo saberlo: el
       cursor lo dice sobre el botón y esto lo dice sobre el bloque entero.

       Va en CSS y no con las variantes hover de Tailwind porque el borde y la
       sombra viven en el li mientras que el hover que importa es el del botón de
       adentro —el bloque tomado no tiene que iluminarse—, y porque el bloque
       arrastra hasta 720ms de retardo por el stagger: heredarlo dejaría el hover
       llegando tarde. Solo color de borde y sombra, así que nada cambia de tamaño
       y la cuadrícula no salta al pasar el ratón. */
    @media (hover: hover) and (pointer: fine) {
      .bloque:has(button:not(:disabled):hover) {
        border-color: var(--color-primary);
        box-shadow: var(--shadow-md);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bloque {
        transition: none;
        transition-delay: 0ms;
      }
    }
  `,
})
export class Grilla {
  private readonly disponibilidad = inject(Disponibilidad);
  protected readonly mover = inject(MoverReserva);
  private readonly reportes = inject(ReportesDelSocio);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly parametros = toSignal(this.ruta.queryParamMap);

  /** Solo la fecha de la URL: cambiar la duración rehace la URL y no tiene que mover el día. */
  private readonly fechaDeLaUrl = computed(() => this.parametros()?.get('fecha') ?? null);

  /**
   * El día que se mira. Arranca en el de la URL si viene —el enlace de mover lleva el de la
   * reserva, para alargarla sin ir a buscar su día— y si no, en hoy. Una fecha pasada o mal
   * escrita también cae en hoy: la grilla no vende horas que ya pasaron.
   */
  protected readonly fecha = linkedSignal(() => {
    const pedida = this.fechaDeLaUrl();
    const hoy = hoyEnElClub();

    return pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida >= hoy ? pedida : hoy;
  });

  /**
   * Cuánto dura la reserva que se busca (T83b). Vive en la URL, como `mover`: recargar no
   * la pierde y el enlace compartido muestra lo mismo. Sin el parámetro, 1 hora.
   */
  protected readonly duracion = computed<DuracionMin>(() =>
    this.parametros()?.get('duracion') === '90' ? 90 : 60,
  );

  protected readonly avisoDeReporte = signal<string | null>(null);

  protected readonly grillas = resource({
    params: () => ({
      fecha: this.fecha(),
      duracion: this.duracion(),
      porId: this.mover.porId(),
      porToken: this.mover.porToken(),
    }),
    // Al mover, el día sin contar la reserva que se mueve: ver `MoverReserva.grillaDelDia`.
    loader: ({ params }) =>
      this.mover.grillaDelDia(params) ??
      this.disponibilidad.delDia(params.fecha, params.duracion),
    // El valor por defecto evita el `undefined` mientras carga, pero **no** que
    // `value()` lance cuando la carga falla: lo que lo lee fuera de la rama del
    // error pregunta antes `hasValue()`.
    defaultValue: [],
  });

  /**
   * Qué horas de este día podría reportar quien mira, según el servidor.
   *
   * **Solo para socios, y sin preguntar si no lo es**: el endpoint es
   * `@SoloSocio()` y pedirlo igual llenaría de 403 la consola de cada visitante.
   *
   * La lista la decide el servidor —lo transcurrido, lo ajeno y lo que está dentro
   * del plazo—, y la grilla no vuelve a decidirlo por su cuenta: ofrecer un botón
   * sobre una hora que la API va a rechazar es prometer algo que no se puede.
   */
  private readonly reportables = resource({
    params: () => ({ fecha: this.fecha(), esSocio: this.esSocio() }),
    loader: ({ params }) =>
      params.esSocio
        ? this.reportes.reportables(params.fecha)
        : Promise.resolve([]),
    defaultValue: [],
  });

  private readonly esSocio = computed(
    () => this.auth.usuario()?.socioId != null,
  );

  /** Lo que oye quien no ve la grilla: cuántas horas quedan y en cuántas canchas. */
  protected readonly resumen = computed(() => {
    // Sobre las visibles y no sobre todas: si el filtro dejó fuera dos canchas,
    // anunciar las horas de esas dos contradice lo que hay en pantalla.
    const grillas = this.visibles();
    const libres = grillas.reduce(
      (total, g) =>
        total + g.bloques.filter((b) => !this.noSePuedeTomar(b)).length,
      0,
    );

    return `${libres} ${libres === 1 ? 'hora disponible' : 'horas disponibles'} en ${
      grillas.length === 1 ? '1 cancha' : `${grillas.length} canchas`
    }.`;
  });

  /** El bloque marcado en la grilla, el que muestra la barra de abajo. */
  protected readonly elegido = signal<{
    cancha: Cancha;
    bloque: BloqueDisponible;
  } | null>(null);

  /** El que ya pasó por "Reservar" y tiene el formulario abierto encima. */
  protected readonly reservando = signal<{
    cancha: Cancha;
    bloque: BloqueDisponible;
  } | null>(null);

  protected readonly filtro = signal('todas');

  /** Las canchas que pasan el filtro: ver `pasaElFiltro`. */
  protected readonly visibles = computed(() => {
    const filtro = this.filtro();
    const grillas = this.grillas.hasValue() ? this.grillas.value() : [];

    return grillas.filter(({ cancha }) => pasaElFiltro(cancha, filtro));
  });

  /** El día por inicio: ver `agruparPorInicio`. */
  protected readonly porHora = computed(() =>
    agruparPorInicio(this.visibles(), {
      reportable: (bloque) => this.reportable(bloque) !== undefined,
      noSeLeVende: (bloque) => this.noSeLeVende(bloque),
    }),
  );

  /** Los inicios juntos por hora del reloj: ver `agruparPorHora`. */
  protected readonly bandas = computed(() => agruparPorHora(this.porHora()));

  /**
   * Las horas que ya pasaron, que van plegadas (decisión 9 del plan, TV5.1). Una banda se
   * pliega entera solo si pasaron todos sus inicios: con el :00 pasado y el :30 por venir
   * queda a la vista, y su :00 dice "Ya pasó".
   */
  protected readonly pasadas = computed(() =>
    this.bandas().filter((banda) => banda.franjas.every((franja) => franja.yaPaso)),
  );

  /** Las que todavía se pueden mirar con algo que hacer: van a la vista. */
  protected readonly vigentes = computed(() =>
    this.bandas().filter((banda) => banda.franjas.some((franja) => !franja.yaPaso)),
  );

  /**
   * Al visitante no le queda en el día ningún inicio de 1 hora y media que se le venda, y
   * alguno estaba libre: lo que falta es el precio, no canchas (T83b). `soloSocios` no
   * cuenta nada para el socio ni con 1 hora.
   */
  protected readonly sinHoraYMediaEnElDia = computed(() => {
    const quedan = this.porHora().filter((franja) => !franja.yaPaso);

    return (
      quedan.some((franja) => franja.soloSocios > 0) &&
      quedan.every((franja) => franja.libres.length === 0)
    );
  });

  /**
   * Si dentro del pliegue hay una hora propia que todavía se puede reportar.
   *
   * El grupo cerrado escondería el botón de T35, y un reporte que nadie
   * encuentra es una función perdida: el título del grupo lo avisa.
   */
  protected readonly hayQueReportar = computed(() =>
    this.pasadas().some((banda) =>
      banda.franjas.some(({ reportables }) =>
        reportables.some(({ bloque }) => {
          const reporte = this.reportable(bloque);
          return reporte !== undefined && !reporte.yaReportada;
        }),
      ),
    ),
  );

  protected readonly precioDeLaHora = precioDeLaHora;

  protected estaElegido(bloque: BloqueDisponible): boolean {
    const eleccion = this.elegido();

    return (
      eleccion?.bloque.inicio === bloque.inicio &&
      eleccion?.bloque.canchaId === bloque.canchaId
    );
  }

  protected reservar(): void {
    this.reservando.set(this.elegido());
  }

  /** El caso reportable de ese bloque, si el servidor lo listó. */
  protected reportable(bloque: BloqueDisponible) {
    // Sin la lista no hay botón: es un agregado de la grilla y no vale tumbarla.
    if (!this.reportables.hasValue()) return undefined;

    return this.reportables
      .value()
      .find(
        (caso) =>
          caso.canchaId === bloque.canchaId && caso.inicio === bloque.inicio,
      );
  }

  protected async reportar(reservaId: number): Promise<void> {
    this.avisoDeReporte.set(null);

    try {
      const { mensaje } = await this.reportes.reportar(reservaId);
      this.avisoDeReporte.set(mensaje);
      this.reportables.reload();
    } catch (falla) {
      this.avisoDeReporte.set(
        mensajeDelServidor(falla, 'No se pudo enviar el reporte.'),
      );
    }
  }

  protected noSePuedeTomar(bloque: BloqueDisponible): boolean {
    return (
      bloque.bloqueado ||
      bloque.reservado ||
      yaEmpezo(bloque) ||
      this.noSeLeVende(bloque)
    );
  }

  /** Sin precio de esa duración no se le vende a quien no es socio (T79, T83b). */
  private noSeLeVende(bloque: BloqueDisponible): boolean {
    return bloque.montoClp === null && !this.esSocio();
  }

  /**
   * Lo que oye quien navega por teclado antes de abrir el formulario.
   *
   * **Reemplaza al contenido del botón**, así que lo que no esté acá no existe para
   * quien usa lector de pantalla: van las dos tarifas —con un solo monto le llega
   * justo la mitad que falta para decidir— y la hora pico, que no es decoración
   * porque le gasta al socio un cupo semanal del que solo tiene dos.
   */
  protected etiqueta(cancha: Cancha, bloque: BloqueDisponible): string {
    const que = this.mover.activo() ? 'Mover tu reserva a' : 'Elegir';
    const pagado = this.mover.pagadoPorElEnlace();

    // Desde el enlace, quien ya pagó oye lo que le costaría el cambio, no la tarifa del
    // socio ni el arriendo: es la pregunta que trae (T91).
    const costo =
      pagado !== null && bloque.montoClp !== null
        ? `, ${minuscula(textoDeLaDiferencia(bloque.montoClp, pagado))}`
        : `, socio ${TARIFA_DEL_SOCIO}` +
          // Sin precio de esa duración no hay arriendo que anunciar: solo lo ve el socio.
          (bloque.montoClp !== null ? `, arriendo ${this.pesos(bloque.montoClp)}` : '');

    return (
      `${que} ${cancha.nombre} de ${this.hora(bloque.inicio)} a ` +
      `${this.hora(bloque.fin)}${costo}` +
      (bloque.esPico ? ', hora pico' : '')
    );
  }

  protected async elegir(
    cancha: Cancha,
    bloque: BloqueDisponible,
  ): Promise<void> {
    if (this.noSePuedeTomar(bloque)) return;

    // Desde el enlace, sin saber cuánto pagó no hay diferencia que decirle: el clic espera
    // a que llegue en vez de marcar una hora que no se puede confirmar.
    if (this.mover.porToken() !== null && this.mover.pagadoPorElEnlace() === null) return;

    // Fuera de "mis reservas" el clic marca la hora: para reservarla, o —desde el
    // enlace— para ver la diferencia antes de confirmar el cambio (T91). Solo el socio
    // mueve al tiro: no paga, y no hay plata que decirle antes.
    if (this.mover.porId() === null) {
      this.elegido.set({ cancha, bloque });
      return;
    }

    await this.mover.moverAlTiro({ cancha, bloque });
  }

  /**
   * El socio no pasa por la pasarela: se va directo a su confirmación.
   *
   * Con el token, no solo con el folio: es lo que hace que su confirmación muestre
   * el resumen y el QR, igual que la de quien vuelve de Webpay. Sin él, el socio
   * llegaba a una pantalla con un número y nada más.
   */
  protected confirmar(reserva: { folio: string; token: string }): void {
    this.reservando.set(null);
    this.elegido.set(null);
    void this.router.navigate(['/reservas/confirmacion'], {
      queryParams: { folio: reserva.folio, t: reserva.token },
    });
  }

  protected elegirDuracion(valor: string): void {
    // Lo marcado era un bloque de la otra duración: su fin y su precio ya no valen.
    this.elegido.set(null);
    void this.router.navigate([], {
      relativeTo: this.ruta,
      // Nulo la saca de la URL: 1 hora es la de siempre y no necesita decirse.
      queryParams: { duracion: valor === '90' ? 90 : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected readonly hora = horaEnElClub;
  protected readonly pesos = enPesos;
  protected readonly tarifaDelSocio = TARIFA_DEL_SOCIO;
  protected readonly iconos = ICONOS_DE_MOTIVO;

  protected readonly motivo = nombreDelMotivo;

  protected readonly superficie = nombreDeSuperficie;
}

/** "Vale $12.000: …" dicho a mitad de una frase. */
function minuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1).replace(/\.$/, '');
}
