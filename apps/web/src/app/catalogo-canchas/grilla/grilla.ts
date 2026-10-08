import {
  Component,
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
import { Selector } from '../../ui/selector';
import {
  BloqueDisponible,
  Cancha,
  Disponibilidad,
  DuracionMin,
} from '../disponibilidad';
import { enPesos, hoyEnElClub, horaEnElClub } from '../reloj-del-club';
import { ICONOS_DE_MOTIVO, nombreDelMotivo } from '../motivos';
import { nombreDeSuperficie } from '../superficies';
import { TARIFA_DEL_SOCIO, yaEmpezo } from './bandas';
import { ControlesDelDia, pasaElFiltro } from './controles-del-dia';
import { MoverReserva } from './mover-reserva';
import { ResumenDeLaEleccion } from './resumen-de-la-eleccion';
import { ResumenDelCambio, textoDeLaDiferencia } from './resumen-del-cambio';
import { Celda, FilaDeLaTabla, tablaDelDia, TipoDeCancha } from './tabla';

@Component({
  selector: 'app-grilla',
  imports: [
    RouterLink,
    Reservar,
    BarraFija,
    ControlesDelDia,
    EstadoVacio,
    Selector,
    ResumenDeLaEleccion,
    ResumenDelCambio,
  ],
  providers: [MoverReserva],
  host: {
    class: 'block',
    // La barra fija tapa la última fila si no se le deja aire, y el checklist del master
    // lo prohíbe. Con los chips de cancha (T104) mide 216px a 375 de ancho.
    '[class.pb-56]': 'elegido() !== null',
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
      EL DÍA, EN TABLA (T103).

      La opción C que eligió el club el 2026-10-08: una fila por hora de inicio y una
      columna por tipo de cancha, con el precio en cada celda. Antes fueron tarjetas por
      cancha (10.223px en un teléfono) y después bandas por hora con chips por cancha;
      la pregunta que trae quien llega es "a qué hora y cuánto", y la tabla la contesta
      sin abrir nada. La cancha puntual se elige en la barra de abajo.
    -->
    @if (visibles().length > 0 && tabla().filas.length === 0) {
      <!-- Sin filas, la pantalla quedaría en blanco: sin esto, "el club no abre este día"
           se leería como una falla de carga. -->
      <p class="mt-6 text-muted-foreground">
        El club no abre este día.
      </p>
    }

    <!-- LAS HORAS QUE YA PASARON, PLEGADAS (decisión 9, TV5.1). A las 18:00 la
         tabla abriría con veinte filas "Ya pasó" antes de la primera hora tomable.
         No se quitan: ahí está el botón para reportar una hora no usada (T35), y
         el título del grupo avisa cuando hay alguna. Fuera de la tabla: dentro serían
         filas que dicen lo mismo en cada celda. <details> y no un botón a mano: el
         desplegable nativo trae el teclado y el estado para el lector. -->
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
          {{ tituloDeLasPasadas() }}
          @if (hayQueReportar()) {
            <span class="font-sans text-sm font-semibold tracking-normal normal-case">
              · puedes reportar horas que no se usaron
            </span>
          }
        </summary>
        <ul>
          @for (fila of pasadas(); track fila.inicio) {
            <li class="mt-3">
              <!-- Las etiquetas van pegadas a propósito: un salto de línea entre ellas
                   mete un espacio en blanco y en pantalla se lee "08:00 –09:00". -->
              <p class="text-sm text-muted-foreground">
                <span class="font-display text-base font-bold text-foreground"
                  >{{ hora(fila.inicio) }}–{{ hora(fila.fin) }}</span
                >
                · Ya pasó
              </p>

              <!-- Las horas propias que ya pasaron siguen siendo un elemento con su
                   botón, no un número: es la única forma de que el socio pueda decir
                   que nadie usó esa cancha (T35). -->
              @for (caso of fila.reportables; track caso.cancha.id) {
                @if (reportable(caso.bloque); as reporte) {
                  <div class="mt-2 flex flex-wrap items-center gap-3 rounded-caja bg-muted p-3">
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
            </li>
          }
        </ul>
      </details>
    }

    @if (!sinHoraYMediaEnElDia() && vigentes().length > 0) {
      <!-- Lo que paga cada uno se dice una vez, arriba (A8): repetido en cada celda era
           decir veintisiete veces lo mismo. Al socio la celda no le muestra plata, que no
           paga, sino cuántas quedan; al visitante, el arriendo. -->
      <p data-tarifas class="mt-6 text-sm text-muted-foreground">
        @if (esSocio()) {
          Socio <strong class="text-accent-strong">{{ tarifaDelSocio }}</strong> · cada
          casilla dice cuántas canchas quedan libres.
        } @else {
          Arriendo de {{ duracion() === 90 ? '1 hora y media' : '1 hora' }} por cancha ·
          socio {{ tarifaDelSocio }}
        }
      </p>

      <!-- table-fixed y celdas que se envuelven: a 375px no hay scroll horizontal ni con
           "desde $12.000" en las dos columnas. Con tope en escritorio: a todo el ancho,
           cada celda era una barra verde de 470px. -->
      <table
        class="mt-2 w-full max-w-2xl table-fixed border-separate border-spacing-x-1
               border-spacing-y-1.5"
      >
        <caption class="sr-only">Canchas libres por hora de inicio y tipo de cancha</caption>
        <!-- Pegado bajo la cabecera del sitio, que mide 64px: a la fila veinte nadie se
             acuerda de cuál columna era la techada. -->
        <thead>
          <tr>
            <th
              scope="col"
              class="sticky top-16 z-10 w-16 bg-background py-2 text-start font-display
                     text-xs font-bold tracking-wide text-muted-foreground uppercase"
            >
              Inicio
            </th>
            @for (tipo of tabla().columnas; track tipo) {
              <th
                scope="col"
                class="sticky top-16 z-10 bg-background px-1 py-2 text-start font-display
                       text-xs font-bold tracking-wide text-muted-foreground uppercase"
              >
                <span class="inline-flex items-center gap-1">
                  @if (tipo === 'techada') {
                    <span class="icono text-base" aria-hidden="true">roofing</span>
                  }
                  {{ nombreDelTipo[tipo] }}
                </span>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (fila of vigentes(); track fila.inicio; let i = $index) {
            <tr>
              <!-- El pico marca la fila: ámbar y la palabra, no solo el color. -->
              <th
                scope="row"
                class="py-2 text-start align-top font-display text-lg leading-none font-bold
                       tabular-nums"
                [class.text-warning-strong]="fila.pico === true"
              >
                {{ hora(fila.inicio) }}
                @if (fila.pico === true) {
                  <span
                    class="mt-1 flex items-center gap-0.5 font-sans text-xs font-semibold"
                  >
                    <span class="icono text-sm" aria-hidden="true">trending_up</span>
                    pico
                  </span>
                }
              </th>
              @for (celda of fila.celdas; track celda.tipo) {
                <td class="align-top">
                  @if (celda.libres.length > 0) {
                    <!-- El precio en tamaño de marcador: es lo que el club pidió que se
                         viera. La libre en el verde de "libre"; la elegida, en rótulo, como
                         la opción marcada del selector (TV2.3 y TV5.1). -->
                    <button
                      type="button"
                      class="bloque flex min-h-11 w-full cursor-pointer flex-col items-start
                             justify-center gap-0.5 rounded-control border px-2 py-1.5
                             text-start"
                      [class.border-transparent]="!estaElegida(celda)"
                      [class.bg-accent-soft]="!estaElegida(celda)"
                      [class.text-accent-strong]="!estaElegida(celda)"
                      [class.border-rotulo]="estaElegida(celda)"
                      [class.bg-rotulo]="estaElegida(celda)"
                      [class.text-on-rotulo]="estaElegida(celda)"
                      [style.--i]="i"
                      [attr.aria-label]="etiqueta(fila, celda)"
                      [attr.aria-pressed]="estaElegida(celda)"
                      (click)="elegirCelda(celda)"
                    >
                      @if (!esSocio() && celda.precio) {
                        <span class="font-display text-2xl leading-none font-extrabold tabular-nums">
                          {{ celda.precio }}
                        </span>
                      }
                      <!-- Al socio, cuántas quedan es lo único que la celda le dice: va en
                           grande, donde al visitante va el precio. -->
                      <span
                        class="inline-flex items-center gap-0.5 font-semibold"
                        [class.text-xs]="!esSocio()"
                        [class.font-display]="esSocio()"
                        [class.text-lg]="esSocio()"
                      >
                        @if (estaElegida(celda)) {
                          <span class="icono text-sm" aria-hidden="true">check_circle</span>
                        }
                        {{ celda.libres.length }}
                        {{ celda.libres.length === 1 ? 'libre' : 'libres' }}
                        @if (fila.pico === null && celda.esPico) {
                          · pico
                        }
                      </span>
                    </button>
                  } @else {
                    <p
                      class="flex min-h-11 items-center rounded-control bg-muted px-2 py-1.5
                             text-xs font-medium text-muted-foreground"
                    >
                      {{ porQueNoHay(celda) }}
                    </p>
                  }

                  <!-- T97. La clase se nombra y se enlaza: a quien llega nuevo le dice que a
                       esta hora hay una clase que le puede servir. Fuera del botón: un
                       enlace dentro de un botón no se puede apretar. -->
                  @if (celda.enClase > 0) {
                    <a
                      routerLink="/clases"
                      class="mt-1 inline-flex min-h-6 items-center gap-1 text-xs font-semibold
                             text-primary underline"
                    >
                      <span class="icono text-sm" aria-hidden="true">{{ iconos['CLASE'] }}</span>
                      {{ celda.enClase }} en clase<span class="sr-only">, ver las clases</span>
                    </a>
                  }
                  @if (celda.enTorneo > 0) {
                    <p class="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span class="icono text-sm" aria-hidden="true">{{ iconos['TORNEO'] }}</span>
                      {{ celda.enTorneo }} en torneo
                    </p>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }

    <!-- Elegir y reservar quedaron separados: la celda se marca y la barra dice qué cancha
         quedó y con cuánto antes del botón. Si la celda tiene más de una libre, ahí se
         cambia (T104). Al mover, la barra confirma el cambio: desde el enlace, con la
         diferencia (T91); desde "mis reservas", sin plata. -->
    @if (elegido(); as eleccion) {
      <app-barra-fija>
        @if (eleccion.libres.length > 1) {
          <app-selector
            class="w-full"
            etiqueta="Cancha"
            [opciones]="canchasDeLaCelda()"
            [valor]="'' + eleccion.cancha.id"
            (valorChange)="cambiarDeCancha($event)"
          />
        }
        @if (mover.activo()) {
          <app-resumen-del-cambio
            [cancha]="eleccion.cancha"
            [bloque]="eleccion.bloque"
            [pagadoClp]="mover.pagadoPorElEnlace()"
            [enviando]="mover.enviando()"
            (soltar)="elegido.set(null)"
            (confirmar)="confirmarCambio(eleccion)"
          />
        } @else {
          <app-resumen-de-la-eleccion
            [cancha]="eleccion.cancha"
            [bloque]="eleccion.bloque"
            [esSocio]="esSocio()"
            (soltar)="elegido.set(null)"
            (reservar)="reservar()"
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

    /* Que la celda responde al mouse hay que mostrarlo, no solo saberlo: el cursor
       lo dice y esto lo confirma.

       Va en CSS y no con las variantes hover de Tailwind porque la celda arrastra
       hasta 720ms de retardo por el stagger, y un \`transition-colors\` lo heredaría:
       el hover llegaría tarde. Solo color de borde y sombra, así que nada cambia de
       tamaño y la tabla no salta al pasar el ratón. La elegida no se ilumina. */
    @media (hover: hover) and (pointer: fine) {
      .bloque:not([aria-pressed='true']):hover {
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

  protected readonly esSocio = computed(
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

  /**
   * La cancha marcada, la que muestra la barra de abajo, con las libres de su celda: entre
   * esas se puede cambiar en la barra (T104).
   */
  protected readonly elegido = signal<
    (Libre & { libres: Libre[] }) | null
  >(null);

  /** Las libres de la celda marcada, como chips de la barra. */
  protected readonly canchasDeLaCelda = computed(() =>
    (this.elegido()?.libres ?? []).map(({ cancha }) => ({
      valor: String(cancha.id),
      etiqueta: cancha.nombre,
    })),
  );

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

  /** El día como tabla de inicio por tipo de cancha: ver `tablaDelDia`. */
  protected readonly tabla = computed(() =>
    tablaDelDia(this.visibles(), {
      reportable: (bloque) => this.reportable(bloque) !== undefined,
      noSeLeVende: (bloque) => this.noSeLeVende(bloque),
    }),
  );

  /** Las filas que ya pasaron, que van plegadas fuera de la tabla (decisión 9, TV5.1). */
  protected readonly pasadas = computed(() =>
    this.tabla().filas.filter((fila) => fila.yaPaso),
  );

  /** Las que todavía se pueden tomar: son la tabla. */
  protected readonly vigentes = computed(() =>
    this.tabla().filas.filter((fila) => !fila.yaPaso),
  );

  /**
   * Con una fila por inicio, contarlas engaña: a las 18:00 serían "20 horas que ya pasaron"
   * por diez horas del reloj. El rango no.
   */
  protected readonly tituloDeLasPasadas = computed(() => {
    const pasadas = this.pasadas();
    const primera = this.hora(pasadas[0].inicio);

    return pasadas.length === 1
      ? `La hora de las ${primera} ya pasó`
      : `Horas que ya pasaron, de ${primera} a ${this.hora(pasadas[pasadas.length - 1].inicio)}`;
  });

  /**
   * Al visitante no le queda en el día ningún inicio de 1 hora y media que se le venda, y
   * alguno estaba libre: lo que falta es el precio, no canchas (T83b). Al socio nunca le
   * pasa, ni con 1 hora: a él no se le deja de vender nada.
   */
  protected readonly sinHoraYMediaEnElDia = computed(() => {
    const celdas = this.vigentes().flatMap((fila) => fila.celdas);

    return (
      celdas.some((celda) => celda.sinLibres === 'no-se-arrienda') &&
      celdas.every((celda) => celda.libres.length === 0)
    );
  });

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

  /** Si lo marcado en la barra es una de las canchas libres de esa celda. */
  protected estaElegida(celda: Celda): boolean {
    const eleccion = this.elegido();

    return celda.libres.some(
      ({ bloque }) =>
        eleccion?.bloque.inicio === bloque.inicio &&
        eleccion?.bloque.canchaId === bloque.canchaId,
    );
  }

  /** Por qué una celda no tiene libres, dicho en la celda misma. */
  protected porQueNoHay(celda: Celda): string {
    switch (celda.sinLibres) {
      case 'ya-paso':
        return 'Ya pasó';
      case 'no-se-arrienda':
        // Hay canchas libres, pero esta duración no se le vende a quien no es socio:
        // "sin libres" sería falso.
        return 'No se arrienda por 1 hora y media';
      case 'llena':
        return 'Sin libres';
      default:
        // Todas en mantención, o el tipo no abre a esta hora.
        return celda.enMantencion > 0 ? 'En mantención' : 'Cerrada';
    }
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
   * Lo que oye quien navega por teclado antes de elegir la celda.
   *
   * **Reemplaza al contenido del botón**, así que lo que no esté acá no existe para
   * quien usa lector de pantalla: el tipo de cancha —"$12.000" solo no dice de qué
   * columna es—, cuántas quedan, lo que le cuesta a quien mira y la hora pico, que no es
   * decoración porque le gasta al socio un cupo semanal del que solo tiene dos.
   *
   * Empieza igual que la etiqueta de los chips de antes, "Elegir … de 08:00 a 09:00": la
   * e2e del eje de la demo lee la hora y el arriendo de ahí.
   */
  protected etiqueta(fila: FilaDeLaTabla, celda: Celda): string {
    const que = this.mover.activo() ? 'Mover tu reserva a' : 'Elegir';
    const cuantas = celda.libres.length;

    return (
      `${que} cancha ${NOMBRE_EN_LA_FRASE[celda.tipo]} de ${this.hora(fila.inicio)} a ` +
      `${this.hora(fila.fin)}, ${cuantas} ${cuantas === 1 ? 'libre' : 'libres'}, ` +
      this.costo(celda) +
      (celda.esPico ? ', hora pico' : '')
    );
  }

  /** Lo que le cuesta la celda a quien mira, para su etiqueta. */
  private costo(celda: Celda): string {
    const monto = celda.libres[0].bloque.montoClp;
    const pagado = this.mover.pagadoPorElEnlace();

    // Desde el enlace, quien ya pagó oye lo que le costaría el cambio a la cancha que se
    // marcaría, que es la primera: es la pregunta que trae (T91).
    if (pagado !== null && monto !== null) {
      return minuscula(textoDeLaDiferencia(monto, pagado));
    }

    // Sin precio de esa duración no hay arriendo que anunciar: solo lo ve el socio.
    return this.esSocio() || celda.precio === null
      ? `socio ${TARIFA_DEL_SOCIO}`
      : `arriendo ${celda.precio}`;
  }

  /**
   * Marca la celda: la cancha de la reserva que se mueve si está libre ahí, y si no, la
   * primera libre en el orden del club (A8). La barra deja cambiarla.
   */
  protected elegirCelda(celda: Celda): void {
    // Desde el enlace, sin saber cuánto pagó no hay diferencia que decirle: el clic espera
    // a que llegue en vez de marcar una hora que no se puede confirmar.
    if (this.mover.porToken() !== null && this.mover.pagadoPorElEnlace() === null) return;

    const suya = celda.libres.find(({ cancha }) => cancha.nombre === this.mover.cancha());

    this.elegido.set({ ...(suya ?? celda.libres[0]), libres: celda.libres });
  }

  protected cambiarDeCancha(id: string): void {
    this.elegido.update((eleccion) => {
      const otra = eleccion?.libres.find(({ cancha }) => String(cancha.id) === id);

      return eleccion && otra ? { ...eleccion, ...otra } : eleccion;
    });
  }

  /** El socio mueve sin pagar; desde el enlace, con la diferencia de por medio (T91). */
  protected confirmarCambio(eleccion: Libre): void {
    void (this.mover.porId() !== null
      ? this.mover.moverAlTiro(eleccion)
      : this.mover.cambiarPorEnlace(eleccion));
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
  protected readonly nombreDelTipo = NOMBRE_DEL_TIPO;

  protected readonly motivo = nombreDelMotivo;

  protected readonly superficie = nombreDeSuperficie;
}

/** Una cancha libre de una celda, con su bloque. */
type Libre = Celda['libres'][number];

/** El encabezado de cada columna. */
const NOMBRE_DEL_TIPO: Record<TipoDeCancha, string> = {
  abierta: 'Al aire libre',
  techada: 'Techada',
};

/** El tipo dicho después de "cancha", en la etiqueta de la celda. */
const NOMBRE_EN_LA_FRASE: Record<TipoDeCancha, string> = {
  abierta: 'al aire libre',
  techada: 'techada',
};

/** "Vale $12.000: …" dicho a mitad de una frase. */
function minuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1).replace(/\.$/, '');
}
