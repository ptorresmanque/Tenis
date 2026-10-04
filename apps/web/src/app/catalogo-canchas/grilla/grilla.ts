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
import { ActivatedRoute, Router } from '@angular/router';

import { Auth } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { irAPagar } from '../../core/pagos/ir-a-pagar';
import { ReportesDelSocio } from '../../reservas/reportes.service';
import { ReservasPublicas } from '../../reservas/reserva-publica.service';
import { mensajeDeRechazo, Reservas } from '../../reservas/reservas.service';
import { Reservar } from '../../reservas/reservar';
import { BarraFija } from '../../ui/barra-fija';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { Selector } from '../../ui/selector';
import {
  BloqueDisponible,
  Cancha,
  Disponibilidad,
  DuracionMin,
  GrillaDeCancha,
} from '../disponibilidad';
import {
  diaEnPalabras,
  enPesos,
  hoyEnElClub,
  horaEnElClub,
  minutosDe,
  proximosDias,
} from '../reloj-del-club';
import { nombreDelMotivo } from '../motivos';
import { nombreDeSuperficie } from '../superficies';
import {
  agruparPorHora,
  agruparPorInicio,
  Banda,
  precioDeLaHora,
  yaEmpezo,
} from './bandas';
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

/**
 * Lo que el bloque dice de la tarifa del socio: nada de plata, porque no paga la
 * hora sino su cuota mensual.
 *
 * En un solo lugar porque aparece en el bloque, en la etiqueta accesible y en la
 * barra de abajo: el día que el club cobre la hora pico al socio, un "sin costo"
 * suelto habría quedado en dos de los tres y nadie lo notaría hasta que reclamen.
 *
 * No viene del servidor a propósito. `BloqueDisponible.montoClp` es la tarifa del
 * no-socio, y el contrato de `catalogo-canchas` no tiene ni tiene por qué tener un
 * precio por tipo de persona.
 */
const TARIFA_DEL_SOCIO = 'sin costo';

@Component({
  selector: 'app-grilla',
  imports: [
    NgTemplateOutlet,
    BandaTipada,
    Reservar,
    BarraFija,
    EstadoVacio,
    Insignia,
    ResumenDelCambio,
    Selector,
  ],
  host: {
    class: 'block',
    // La barra fija tapa la última fila de bloques si no se le deja aire, y el
    // checklist del master lo prohíbe.
    '[class.pb-28]': 'elegido() !== null',
  },
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Disponibilidad</h1>

    @if (enModoMover()) {
      <!-- Se dice arriba y no en cada bloque: quien llega desde "mis reservas" o desde
           el enlace tiene que saber que el próximo clic mueve su hora en vez de tomar
           una nueva. Y quien pagó, la regla de la plata, antes de elegir (T88). -->
      <p class="mt-3 rounded-lg bg-muted p-3 font-medium">
        Elige la nueva hora para tu reserva. La que tenías queda liberada.
        @if (pagadoPorElEnlace(); as pagado) {
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

    @if (errorAlMover(); as falla) {
      <p role="alert" class="mt-3 rounded-lg bg-destructive/10 p-3 text-destructive">
        {{ falla }}
      </p>
    }

    <div class="mt-4 flex flex-wrap items-end gap-4">
      <!-- La semana a un toque. El calendario sigue estando al lado para ir más
           lejos: siete chips cubren lo que la gente reserva de verdad, y el resto
           no justifica un calendario propio pudiendo usar el del sistema.

           A ancho completo: compartiendo fila con el campo de fecha, los siete
           chips no llegaban a encogerse. -->
      <app-selector
        class="w-full"
        etiqueta="Día"
        estilo="chips"
        [opciones]="chipsDeDia()"
        [valor]="fecha()"
        (valorChange)="fecha.set($event)"
      />

      <div>
        <label for="fecha" class="block text-sm font-medium">Otro día</label>
        <!-- El cursor y el borde que responde: sin eso, el campo se lee como una
             etiqueta con una fecha escrita y nadie prueba a abrirlo. -->
        <input
          id="fecha"
          type="date"
          class="campo mt-1 w-auto cursor-pointer py-2 transition-colors
                 hover:border-primary"
          [value]="fecha()"
          (change)="cambiarFecha($event)"
        />
      </div>
    </div>

    <p class="mt-3 text-muted-foreground">{{ diaEnPalabras(fecha()) }}</p>

    <!-- También al mover (T87): parte en la de la reserva, que trae el enlace de "mis
         reservas", y cambiarla es alargarla o acortarla. -->
    <app-selector
      class="mt-4 block"
      etiqueta="Duración"
      [opciones]="DURACIONES"
      [valor]="'' + duracion()"
      (valorChange)="elegirDuracion($event)"
    />

    <!-- Los filtros salen de lo que la cancha ya declara —techada e
         iluminación—, así que filtran en el navegador sobre lo que ya llegó:
         una consulta más al servidor no traería nada nuevo. -->
    <app-selector
      class="mt-4 block"
      etiqueta="Filtrar canchas"
      [opciones]="FILTROS"
      [valor]="filtro()"
      (valorChange)="filtro.set($event)"
    />

    <!-- La leyenda no es decoración: los tres estados se distinguen por color,
         forma e ícono, y esto es lo que dice qué significa cada uno. -->
    <ul class="mt-4 flex flex-wrap gap-2">
      <li><app-insignia variante="libre">Libre</app-insignia></li>
      <li><app-insignia variante="neutro" icono="lock">Ocupado</app-insignia></li>
      <li><app-insignia variante="neutro" icono="build">En mantención</app-insignia></li>
    </ul>

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
        @if (franja.ocupadas > 0 || (franja.enMantencion > 0 && banda.enMantencion === null)) {
          <p class="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
            @if (franja.ocupadas > 0) {
              <span class="inline-flex items-center gap-1">
                <span class="icono text-base" aria-hidden="true">lock</span>
                {{ franja.ocupadas }}
                {{ franja.ocupadas === 1 ? 'ocupada' : 'ocupadas' }}
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

    <!-- Elegir y reservar quedaron separados: el bloque se marca, la barra dice
         qué se marcó y con cuánto, y recién "Reservar" abre el formulario. El
         diálogo que ya existía sigue siendo el que pide acompañantes y cobra. -->
    @if (elegido(); as eleccion) {
      @if (pagadoPorElEnlace(); as pagado) {
        <!-- Desde el enlace, con plata en juego: la diferencia antes del botón (T91). -->
        <app-barra-fija>
          <app-resumen-del-cambio
            [cancha]="eleccion.cancha"
            [bloque]="eleccion.bloque"
            [pagadoClp]="pagado"
            [enviando]="enviandoMovimiento()"
            (soltar)="elegido.set(null)"
            (confirmar)="cambiarPorEnlace()"
          />
        </app-barra-fija>
      } @else {
        <app-barra-fija>
          <div role="status" aria-live="polite">
            <!-- Lo elegido, en rótulo (TV5.1): es la pieza que se lee de un vistazo
                 antes de apretar "Reservar". -->
            <p
              class="inline-flex bg-rotulo py-1 ps-3 font-display text-lg font-bold tracking-wide
                     text-on-rotulo uppercase corte-fin"
            >
              {{ eleccion.cancha.nombre }} ·
              {{ hora(eleccion.bloque.inicio) }}–{{ hora(eleccion.bloque.fin) }}
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              Socio {{ tarifaDelSocio }}
              @if (eleccion.bloque.montoClp !== null) {
                · Arriendo
                <span class="font-semibold text-accent-strong">
                  {{ pesos(eleccion.bloque.montoClp) }}
                </span>
              }
              @if (eleccion.bloque.esPico) {
                · Hora pico
              }
            </p>
          </div>

          <div class="flex gap-2">
            <button type="button" class="boton boton-texto" (click)="elegido.set(null)">
              Soltar
            </button>
            <button type="button" class="boton boton-primario" (click)="reservar()">
              Reservar
            </button>
          </div>
        </app-barra-fija>
      }
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
  private readonly reservas = inject(Reservas);
  private readonly enlace = inject(ReservasPublicas);
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
   * La reserva que se está reubicando, si se llegó desde "mis reservas".
   *
   * El modo viaja en la URL y no en un servicio compartido: así sobrevive a un
   * refresco y a compartir el enlace, y quien no viene de ahí no paga nada.
   */
  protected readonly moviendo = computed(() => {
    const id = Number(this.parametros()?.get('mover'));

    return Number.isInteger(id) && id > 0 ? id : null;
  });

  /**
   * Cuánto dura la reserva que se busca (T83b). Vive en la URL, como `mover`: recargar no
   * la pierde y el enlace compartido muestra lo mismo. Sin el parámetro, 1 hora.
   */
  protected readonly duracion = computed<DuracionMin>(() =>
    this.parametros()?.get('duracion') === '90' ? 90 : 60,
  );

  protected readonly DURACIONES = [
    { valor: '60', etiqueta: '1 hora' },
    { valor: '90', etiqueta: '1 hora y media' },
  ];

  /**
   * La reserva que se mueve desde su enlace, sin sesión (T88): el token es la llave. Como
   * `mover`, vive en la URL.
   */
  protected readonly moviendoPorToken = computed(
    () => this.parametros()?.get('moverToken') || null,
  );

  /** Si el próximo clic mueve una reserva en vez de elegir una hora nueva. */
  protected readonly enModoMover = computed(
    () => this.moviendo() !== null || this.moviendoPorToken() !== null,
  );

  /** Lo que pagó quien mueve desde el enlace, para decirle la regla antes de elegir. */
  private readonly reservaDelEnlace = resource({
    params: () => this.moviendoPorToken() ?? undefined,
    loader: ({ params: token }) => this.enlace.porToken(token),
  });

  protected readonly pagadoPorElEnlace = computed(() =>
    this.reservaDelEnlace.hasValue() ? this.reservaDelEnlace.value().pagadoClp : null,
  );

  protected readonly errorAlMover = signal<string | null>(null);
  protected readonly avisoDeReporte = signal<string | null>(null);
  protected readonly enviandoMovimiento = signal(false);

  protected readonly grillas = resource({
    params: () => ({
      fecha: this.fecha(),
      duracion: this.duracion(),
      moviendo: this.moviendo(),
      moviendoPorToken: this.moviendoPorToken(),
    }),
    loader: ({ params }) => this.pedirDia(params),
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

  protected readonly FILTROS = [
    { valor: 'todas', etiqueta: 'Todas' },
    { valor: 'techadas', etiqueta: 'Techadas' },
    { valor: 'iluminacion', etiqueta: 'Con iluminación' },
    { valor: 'aire-libre', etiqueta: 'Al aire libre' },
  ];

  /**
   * Las canchas que pasan el filtro.
   *
   * "Al aire libre" es lo contrario de techada y no un atributo propio: si fuera
   * un tercer campo del modelo, tarde o temprano existiría una cancha marcada
   * como techada y al aire libre a la vez.
   */
  protected readonly visibles = computed(() => {
    const filtro = this.filtro();
    const grillas = this.grillas.hasValue() ? this.grillas.value() : [];

    return grillas.filter(({ cancha }) => {
      switch (filtro) {
        case 'techadas':
          return cancha.techada;
        case 'iluminacion':
          return cancha.iluminacion;
        case 'aire-libre':
          return !cancha.techada;
        default:
          return true;
      }
    });
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

  /** Los siete chips de la tira de días, empezando por hoy. */
  protected readonly chipsDeDia = computed(() =>
    proximosDias(7).map((dia) => ({
      valor: dia.fecha,
      etiqueta: dia.etiqueta,
      sub: dia.numero,
    })),
  );

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
    const que = this.enModoMover() ? 'Mover tu reserva a' : 'Elegir';
    const pagado = this.pagadoPorElEnlace();

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

    const reservaId = this.moviendo();

    // Fuera de "mis reservas" el clic marca la hora: para reservarla, o —desde el
    // enlace— para ver la diferencia antes de confirmar el cambio (T91). Solo el socio
    // mueve al tiro: no paga, y no hay plata que decirle antes.
    if (reservaId === null) {
      this.elegido.set({ cancha, bloque });
      return;
    }

    // Un solo movimiento en vuelo: con la red lenta, quien no ve reacción toca otro
    // bloque, y dos PATCH dejan la reserva donde responda el último, no donde eligió.
    if (this.enviandoMovimiento()) return;

    this.enviandoMovimiento.set(true);
    this.errorAlMover.set(null);

    try {
      await this.reservas.mover(reservaId, destinoDe(cancha, bloque));
      await this.router.navigate(['/mis-reservas']);
    } catch (falla) {
      // Se queda en la grilla a propósito: la hora que eligió no se pudo, pero las
      // otras siguen ahí y volver atrás para reintentar sería un paso de más.
      this.errorAlMover.set(mensajeDeRechazo(falla).mensaje);
    } finally {
      this.enviandoMovimiento.set(false);
    }
  }

  /**
   * Confirma el cambio desde el enlace (T91), con la hora marcada en la barra.
   *
   * Si vale más que lo pagado, va a pagar la diferencia: la reserva se mueve recién
   * cuando Webpay autoriza, y la vuelta lleva a su página (T89). Si no, se mueve al tiro
   * y no se devuelve nada. La diferencia la recalcula el servidor; lo de acá decide solo
   * a qué ruta ir, y si el servidor no está de acuerdo, lo dice su rechazo.
   */
  protected async cambiarPorEnlace(): Promise<void> {
    const token = this.moviendoPorToken();
    const eleccion = this.elegido();
    const pagado = this.pagadoPorElEnlace();

    if (token === null || eleccion === null || pagado === null) return;
    if (this.enviandoMovimiento()) return;

    this.enviandoMovimiento.set(true);
    this.errorAlMover.set(null);
    const destino = destinoDe(eleccion.cancha, eleccion.bloque);

    try {
      if ((eleccion.bloque.montoClp ?? 0) > pagado) {
        irAPagar(await this.enlace.pagarDiferencia(token, destino));
      } else {
        await this.enlace.mover(token, destino);
        // A la página de la reserva, que es su "mis reservas", con lo que pasó.
        await this.router.navigate(['/r', token], { queryParams: { cambio: 'hecho' } });
      }
    } catch (falla) {
      this.errorAlMover.set(mensajeDeRechazo(falla).mensaje);
    } finally {
      this.enviandoMovimiento.set(false);
    }
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

  /**
   * El día que muestra la grilla. Al mover, sin contar la reserva que se mueve (T87): con
   * la pública, alargarla en la misma cancha y hora salía ocupado por ella misma.
   */
  private pedirDia(consulta: {
    fecha: string;
    duracion: DuracionMin;
    moviendo: number | null;
    moviendoPorToken: string | null;
  }): Promise<GrillaDeCancha[]> {
    const { fecha, duracion } = consulta;

    if (consulta.moviendo !== null) {
      return this.reservas.grillaParaMover(consulta.moviendo, fecha, duracion);
    }

    if (consulta.moviendoPorToken !== null) {
      return this.enlace.grillaParaMover(consulta.moviendoPorToken, fecha, duracion);
    }

    return this.disponibilidad.delDia(fecha, duracion);
  }

  protected cambiarFecha(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;

    // El input vacío —se puede borrar con el teclado— no dispara una consulta
    // que la API va a rechazar.
    if (valor) {
      this.fecha.set(valor);
    }
  }

  protected readonly hora = horaEnElClub;
  protected readonly pesos = enPesos;
  protected readonly tarifaDelSocio = TARIFA_DEL_SOCIO;
  protected readonly diaEnPalabras = diaEnPalabras;

  protected readonly motivo = nombreDelMotivo;

  protected readonly superficie = nombreDeSuperficie;
}

/** A dónde va un cambio: la cancha, el inicio y la duración del bloque elegido. */
function destinoDe(cancha: Cancha, bloque: BloqueDisponible) {
  return {
    canchaId: cancha.id,
    inicio: bloque.inicio,
    // La del bloque, como al reservar: la grilla lo pidió de la duración elegida.
    duracionMin: minutosDe(bloque),
  };
}

/** "Vale $12.000: …" dicho a mitad de una frase. */
function minuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1).replace(/\.$/, '');
}
