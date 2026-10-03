import { NgTemplateOutlet } from '@angular/common';
import { Component, Directive, computed, inject, resource, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { Auth } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { ReportesDelSocio } from '../../reservas/reportes.service';
import { mensajeDeRechazo, Reservas } from '../../reservas/reservas.service';
import { Reservar } from '../../reservas/reservar';
import { BarraFija } from '../../ui/barra-fija';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { Selector } from '../../ui/selector';
import { BloqueDisponible, Cancha, Disponibilidad } from '../disponibilidad';
import {
  diaEnPalabras,
  enPesos,
  hoyEnElClub,
  horaEnElClub,
  proximosDias,
} from '../reloj-del-club';
import { nombreDelMotivo } from '../motivos';
import { nombreDeSuperficie } from '../superficies';

/** Una hora de la grilla, con lo que pasa en cada cancha. */
export interface Franja {
  inicio: string;
  fin: string;
  libres: { cancha: Cancha; bloque: BloqueDisponible }[];
  /**
   * Las horas tomadas del propio socio que ya pasaron y sobre las que
   * puede reportar que nadie las usó (T35).
   *
   * Van aparte de la cuenta de ocupadas porque son las únicas ocupadas
   * que necesitan seguir siendo un elemento con un botón: agrupar por hora
   * convirtió el resto en un número, y con ellas eso habría borrado la
   * función sin que nadie lo notara hasta que el club preguntara por qué
   * dejaron de llegar reportes.
   */
  reportables: { cancha: Cancha; bloque: BloqueDisponible }[];
  ocupadas: number;
  enMantencion: number;
  esPico: boolean;
  /** Sin libres por haber pasado, que no es lo mismo que un club lleno. */
  yaPaso: boolean;
}

/**
 * Le pone tipo al `let-franja` de la plantilla de la franja.
 *
 * Sin esto el `ng-template` le da `any` y el compilador deja de revisar esa
 * parte de la plantilla: en la revisión de TV5.1 un campo inventado,
 * `franja.libresQueNoExisten`, compilaba igual. Con el `@for` de antes eso no
 * pasaba.
 */
@Directive({ selector: 'ng-template[franjaTipada]' })
export class FranjaTipada {
  static ngTemplateContextGuard(
    _directiva: FranjaTipada,
    contexto: unknown,
  ): contexto is { $implicit: Franja } {
    return true;
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

/**
 * Si la hora ya empezó, según el reloj de quien mira.
 *
 * La API rechaza reservar una hora que ya empezó (`BLOQUE_EN_EL_PASADO`), y la
 * grilla no ofrece lo que la API va a rechazar: a las 16:40 ofrecía la de las
 * 08:00. El filtro va acá y no en la disponibilidad pública porque el mesón lee el
 * mismo endpoint y sí puede tomar la hora que está corriendo. Si el reloj del
 * navegador anda mal, manda la API.
 */
function yaEmpezo(bloque: BloqueDisponible): boolean {
  return new Date(bloque.inicio).getTime() <= Date.now();
}

@Component({
  selector: 'app-grilla',
  imports: [NgTemplateOutlet, FranjaTipada, Reservar, BarraFija, EstadoVacio, Insignia, Selector],
  host: {
    class: 'block',
    // La barra fija tapa la última fila de bloques si no se le deja aire, y el
    // checklist del master lo prohíbe.
    '[class.pb-28]': 'elegido() !== null',
  },
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Disponibilidad</h1>

    @if (moviendo() !== null) {
      <!-- Se dice arriba y no en cada bloque: quien llega desde "mis reservas" tiene
           que saber que el proximo clic mueve su hora en vez de tomar una nueva. -->
      <p class="mt-3 rounded-lg bg-muted p-3 font-medium">
        Elige la nueva hora para tu reserva. La que tenías queda liberada.
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
        @for (franja of pasadas(); track franja.inicio) {
          <ng-container
            [ngTemplateOutlet]="franjaTpl"
            [ngTemplateOutletContext]="{ $implicit: franja }"
          />
        }
      </details>
    }

    @for (franja of vigentes(); track franja.inicio) {
      <ng-container
        [ngTemplateOutlet]="franjaTpl"
        [ngTemplateOutletContext]="{ $implicit: franja }"
      />
    }

    <!-- Una franja: se escribe una vez y se usa dentro y fuera del pliegue. -->
    <ng-template #franjaTpl franjaTipada let-franja>
      <section class="mt-6 border-t border-border pt-5">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <!-- Las etiquetas van pegadas a propósito: un salto de línea entre
               ellas mete un espacio en blanco y en pantalla se lee "08:00 –09:00",
               con el guion suelto. -->
          <!-- La hora en un rótulo de color (TV5.1): campo, o ámbar suave si es
               hora pico. No una franja lateral: esa barra en el canto es el tell
               de interfaz generada que el lint de franjas prohíbe. -->
          <h2 class="flex items-baseline font-display leading-none">
            <span
              class="px-2 py-1 text-3xl font-bold tabular-nums"
              [class]="
                franja.esPico ? 'bg-warning-soft text-warning-strong' : 'bg-campo text-on-campo'
              "
              >{{ hora(franja.inicio) }}</span
            ><span class="ms-1 text-lg font-semibold text-muted-foreground"
              >–{{ hora(franja.fin) }}</span
            >
          </h2>

          <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
            @if (franja.libres.length > 0) {
              <span class="font-semibold text-accent-strong">
                {{ franja.libres.length }}
                {{ franja.libres.length === 1 ? 'libre' : 'libres' }}
              </span>
              <span class="text-muted-foreground">Socio {{ tarifaDelSocio }}</span>
              <span class="text-muted-foreground" aria-hidden="true">·</span>
              <span class="text-muted-foreground">
                Arriendo
                <strong class="text-accent-strong">
                  {{ precioDeLaHora(franja.libres) }}
                </strong>
              </span>
            } @else {
              <span class="font-medium text-muted-foreground">
                {{ franja.yaPaso ? 'Ya pasó' : 'Sin canchas libres' }}
              </span>
            }
            @if (franja.esPico) {
              <app-insignia variante="aviso" icono="trending_up">Hora pico</app-insignia>
            }
          </p>
        </div>

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
                <button
                  type="button"
                  class="cursor-pointer rounded-control border border-border px-2 py-1
                         text-xs font-medium text-muted-foreground transition-colors"
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
        @if (franja.ocupadas > 0 || franja.enMantencion > 0) {
          <p class="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
            @if (franja.ocupadas > 0) {
              <span class="inline-flex items-center gap-1">
                <span class="icono text-base" aria-hidden="true">lock</span>
                {{ franja.ocupadas }}
                {{ franja.ocupadas === 1 ? 'ocupada' : 'ocupadas' }}
              </span>
            }
            @if (franja.enMantencion > 0) {
              <span class="inline-flex items-center gap-1">
                <span class="icono text-base" aria-hidden="true">build</span>
                {{ franja.enMantencion }} en mantención
              </span>
            }
          </p>
        }
      </section>
    </ng-template>

    <!-- Elegir y reservar quedaron separados: el bloque se marca, la barra dice
         qué se marcó y con cuánto, y recién "Reservar" abre el formulario. El
         diálogo que ya existía sigue siendo el que pide acompañantes y cobra. -->
    @if (elegido(); as eleccion) {
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
            Socio {{ tarifaDelSocio }} · Arriendo
            <span class="font-semibold text-accent-strong">
              {{ pesos(eleccion.bloque.montoClp) }}
            </span>
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
  private readonly reportes = inject(ReportesDelSocio);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly fecha = signal(hoyEnElClub());

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

  protected readonly errorAlMover = signal<string | null>(null);
  protected readonly avisoDeReporte = signal<string | null>(null);
  protected readonly enviandoMovimiento = signal(false);

  protected readonly grillas = resource({
    params: () => ({ fecha: this.fecha() }),
    loader: ({ params }) => this.disponibilidad.delDia(params.fecha),
    // Con valor por defecto, `value()` nunca lanza y el template no necesita
    // preguntar `hasValue()` antes de cada lectura.
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

    return this.grillas.value().filter(({ cancha }) => {
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

  /**
   * El día entero, agrupado por hora y no por cancha.
   *
   * **Es el cambio de eje que decidió el club el 2026-09-08**, y la razón está
   * en la pregunta que trae el socio: *cuándo* puedo jugar. Agrupada por cancha,
   * esa pregunta se responde recorriendo ocho listas y comparándolas de memoria;
   * agrupada por hora se responde de un vistazo.
   *
   * Lo que arregla de paso: con ocho canchas y catorce bloques, la pantalla eran
   * 112 tarjetas, que a dos columnas dan 56 filas y **10.223px de alto en un
   * teléfono**. Por hora son catorce bandas.
   *
   * Las canchas que no se pueden tomar no desaparecen: se cuentan. Saber que a
   * las 19:00 hay seis ocupadas y ninguna libre es información, y borrarla haría
   * que esa hora se viera igual que una que el club no abre.
   */
  protected readonly porHora = computed(() => {
    const horas = new Map<string, Franja>();

    for (const { cancha, bloques } of this.visibles()) {
      for (const bloque of bloques) {
        const franja = horas.get(bloque.inicio) ?? {
          inicio: bloque.inicio,
          fin: bloque.fin,
          libres: [],
          reportables: [],
          ocupadas: 0,
          enMantencion: 0,
          esPico: bloque.esPico,
          yaPaso: yaEmpezo(bloque),
        };

        if (bloque.bloqueado) franja.enMantencion++;
        else if (bloque.reservado) {
          franja.ocupadas++;
          if (this.reportable(bloque)) franja.reportables.push({ cancha, bloque });
        } else if (!yaEmpezo(bloque)) franja.libres.push({ cancha, bloque });

        horas.set(bloque.inicio, franja);
      }
    }

    return [...horas.values()].sort((una, otra) => una.inicio.localeCompare(otra.inicio));
  });

  /** Las franjas que ya pasaron, que van plegadas (decisión 9 del plan, TV5.1). */
  protected readonly pasadas = computed(() => this.porHora().filter((franja) => franja.yaPaso));

  /** Las que todavía se pueden mirar con algo que hacer: van a la vista. */
  protected readonly vigentes = computed(() => this.porHora().filter((franja) => !franja.yaPaso));

  /**
   * Si dentro del pliegue hay una hora propia que todavía se puede reportar.
   *
   * El grupo cerrado escondería el botón de T35, y un reporte que nadie
   * encuentra es una función perdida: el título del grupo lo avisa.
   */
  protected readonly hayQueReportar = computed(() =>
    this.pasadas().some(({ reportables }) =>
      reportables.some(({ bloque }) => {
        const reporte = this.reportable(bloque);
        return reporte !== undefined && !reporte.yaReportada;
      }),
    ),
  );

  /**
   * Lo que cuesta arrendar en esa hora.
   *
   * Casi siempre es un solo monto para todas las canchas, y entonces se dice una
   * vez arriba en vez de repetirlo en cada chip. Cuando el club cobra distinto
   * por cancha, se dice "desde" y el monto de cada una viaja en su etiqueta
   * accesible, que es donde ya estaba.
   */
  protected precioDeLaHora(libres: { bloque: BloqueDisponible }[]): string {
    const montos = [...new Set(libres.map(({ bloque }) => bloque.montoClp))];

    return montos.length === 1
      ? enPesos(montos[0])
      : `desde ${enPesos(Math.min(...montos))}`;
  }

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
    return bloque.bloqueado || bloque.reservado || yaEmpezo(bloque);
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
    const que = this.moviendo() !== null ? 'Mover tu reserva a' : 'Elegir';

    return (
      `${que} ${cancha.nombre} de ${this.hora(bloque.inicio)} a ` +
      `${this.hora(bloque.fin)}, socio ${TARIFA_DEL_SOCIO}, ` +
      `arriendo ${this.pesos(bloque.montoClp)}` +
      (bloque.esPico ? ', hora pico' : '')
    );
  }

  protected async elegir(
    cancha: Cancha,
    bloque: BloqueDisponible,
  ): Promise<void> {
    if (this.noSePuedeTomar(bloque)) return;

    const reservaId = this.moviendo();

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
      await this.reservas.mover(reservaId, {
        canchaId: cancha.id,
        inicio: bloque.inicio,
      });
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
