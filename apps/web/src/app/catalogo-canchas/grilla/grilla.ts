import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  resource,
  signal,
  TemplateRef,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButton } from '@angular/material/button';
import { MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet';

import { Auth } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { ReportesDelSocio } from '../../reservas/reportes.service';
import { Reservar } from '../../reservas/reservar';
import { BarraFija } from '../../ui/barra-fija';
import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import {
  BloqueDisponible,
  Cancha,
  Disponibilidad,
  DuracionMin,
} from '../disponibilidad';
import { CeldaElegible, Marcador } from '../marcador';
import {
  diaCortoEnElClub,
  enPesos,
  hoyEnElClub,
  horaEnElClub,
  mananaEnElClub,
  mesCortoEnElClub,
} from '../reloj-del-club';
import { TARIFA_DEL_SOCIO, yaEmpezo } from './bandas';
import {
  ControlesDelDia,
  duracionCorta,
  etiquetaDeLaDuracion,
  filtroCorto,
  pasaElFiltro,
} from './controles-del-dia';
import { MoverReserva } from './mover-reserva';
import { ResumenDeLaEleccion } from './resumen-de-la-eleccion';
import { ResumenDelCambio, textoDeLaDiferencia } from './resumen-del-cambio';

@Component({
  selector: 'app-grilla',
  imports: [
    MatButton,
    MatExpansionModule,
    Marcador,
    Reservar,
    BarraFija,
    ControlesDelDia,
    NgTemplateOutlet,
    EstadoVacio,
    ResumenDeLaEleccion,
    ResumenDelCambio,
    Esqueleto,
  ],
  providers: [MoverReserva],
  host: {
    class: 'block',
    // La barra fija tapa la última fila si no se le deja aire, y el checklist del master
    // lo prohíbe.
    '[class.pb-56]': 'elegido() !== null',
  },
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Reserva tu cancha</h1>

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

    @if (avisoAlLlegar(); as aviso) {
      <p role="status" class="mt-3 rounded-lg bg-muted p-3 text-sm font-medium">
        {{ aviso }}
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

    <!-- Cambiar de día suelta lo marcado: la barra no dice la fecha, y "Reservar" tomaría
         la hora del día anterior con la tabla de otro a la vista. Escritos una vez: los usan
         la página y la hoja de «Cambiar» (T345), y dos copias terminarían por diferir. -->
    <ng-template #controles>
      <app-controles-del-dia
        [(fecha)]="fecha"
        (fechaChange)="elegido.set(null)"
        [duracion]="duracion()"
        [(filtro)]="filtro"
        (cambiarDuracion)="elegirDuracion($event)"
      />
    </ng-template>
    <!-- En el teléfono no están (N3, SPEC-sitio.md, Decimoctava parte): la línea de abajo es la
         única entrada, y su «Cambiar» abre estos mismos controles en la hoja. -->
    <div #controlesArriba data-controles-arriba class="hidden sm:block">
      <ng-container [ngTemplateOutlet]="controles" />
    </div>

    <!-- LO ELEGIDO (T345, SPEC-sitio.md M2 y B3). Los controles de arriba ocupan media pantalla
         y se pierden al bajar por el tablero: había quien no sabía que podía cambiar el día o
         la duración. La línea queda pegada bajo el encabezado (64 px) y «Cambiar» trae los
         mismos controles en una hoja desde abajo. En el teléfono es la única entrada (T348,
         N3), y por eso va acá, arriba desde el principio. Fuera del @if del tablero: mientras
         la grilla nueva carga, el tablero se va, y con él se iba el botón al que la hoja le
         devuelve el foco al cerrarse. -->
    <!-- En grande (T349, N2), arriba están los controles: la línea se esconde mientras se ven
         y aparece al bajar, fija y no pegada, porque en el flujo empujaría el tablero 58 px al
         aparecer. En el teléfono va pegada siempre. Escondida (display: none) sigue en el DOM,
         sin parada de teclado ni lector (C4). -->
    <div
      data-resumen-de-controles
      class="a-sangre sticky top-16 z-30 mt-6 flex items-center justify-between gap-3
             border-b border-border bg-card px-sangre-4 py-2 shadow-sm sm:fixed sm:inset-x-0
             sm:top-16 sm:mt-0"
      [class.sm:hidden]="controlesALaVista()"
    >
      <!-- Cada valor con su rótulo encima (N1): «Todas» solo no decía que eran las canchas. -->
      <dl class="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
        @for (dato of loElegido(); track dato.rotulo) {
          <div>
            <dt
              class="font-display text-xs leading-tight font-bold tracking-wide
                     text-muted-foreground uppercase"
            >
              {{ dato.rotulo }}
            </dt>
            <dd class="text-sm leading-tight font-semibold">{{ dato.valor }}</dd>
          </div>
        }
      </dl>
      <!-- El nombre empieza con lo que se ve (WCAG 2.5.3) y dice qué cambia. El botón va a
           abrirControles: la hoja le devuelve el foco a él, porque Safari no se lo da al tocarlo. -->
      <button
        matButton="outlined"
        type="button"
        class="chico"
        aria-label="Cambiar el día, la duración o las canchas"
        (click)="abrirControles($event)"
      >
        Cambiar
      </button>
    </div>

    <!-- Los cambios de estado se anuncian: quien usa lector de pantalla no ve
         que la grilla se repobló. -->
    <div role="status" aria-live="polite" class="mt-6">
      @if (grillas.isLoading()) {
        <app-esqueleto [filas]="6" etiqueta="Buscando horas disponibles…" />
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
          <!-- Cada lleno va en una rama distinta del mismo if: se ve uno a la vez.
               mat-guidelines-ignore: multiples-filled -->
          <button
            matButton="filled"
            type="button"
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
            matButton="filled"
            type="button"
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

    @if (visibles().length > 0 && sinBloques()) {
      <!-- Sin horas, la pantalla quedaría en blanco: sin esto, "el club no abre este día"
           se leería como una falla de carga. -->
      <p class="mt-6 text-muted-foreground">
        El club no abre este día.
      </p>
    }

    <!-- LAS HORAS QUE YA PASARON, PLEGADAS (decisión 9, TV5.1). A las 18:00 la
         tabla abriría con veinte filas "Ya pasó" antes de la primera hora tomable.
         No se quitan: ahí está el botón para reportar una hora no usada (T35), y
         el título del grupo avisa cuando hay alguna. Fuera de la tabla: dentro serían
         filas que dicen lo mismo en cada celda. Un panel de Material (T281; antes, un
         <details>): trae el teclado y el estado para el lector. -->
    @if (pasadas().length > 0) {
      <mat-expansion-panel class="mt-6 border-t border-border">
        <mat-expansion-panel-header>
          <mat-panel-title>
            <span class="flex flex-wrap items-baseline gap-x-2 text-muted-foreground">
              <span class="font-display text-lg font-bold tracking-wide uppercase">{{
                tituloDeLasPasadas()
              }}</span>
              @if (hayQueReportar()) {
                <span class="text-sm font-semibold">· puedes reportar horas que no se usaron</span>
              }
            </span>
          </mat-panel-title>
        </mat-expansion-panel-header>
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
                        matButton
                        type="button"
                        class="chico"
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
      </mat-expansion-panel>
    }

    <!--
      EL DÍA, EN EL TABLERO DE LA PORTADA (T265).

      El mismo de "Libre hoy", sobre la misma banda de campo: el usuario pidió el
      2026-10-15 que disponibilidad se viera igual (SPEC-revision-qa.md, A1), y eso deja
      atrás la tabla por tipo de cancha de T103. La celda libre elige su cancha, y lo que
      cuesta se dice una vez arriba y en la barra al elegir: en cada celda serían ocho
      montos por hora.
    -->
    @if (!sinHoraYMediaEnElDia() && hayHorasPorDelante()) {
      <section
        class="a-sangre mt-6 bg-campo px-sangre-4 py-6 text-on-campo sm:px-sangre-6"
        aria-label="Las canchas del día"
      >
        <!-- Lo que paga cada uno se dice una vez (A8). Al socio, que no paga; al visitante,
             el arriendo de la duración elegida, "desde" si no todas cuestan lo mismo. La
             hora prime la dice la leyenda del tablero. -->
        <p data-tarifas class="mb-3 text-sm text-on-campo/85">
          @if (esSocio()) {
            Socio <strong>{{ tarifaDelSocio }}</strong>: elige una cancha libre.
          } @else {
            Arriendo de {{ etiquetaDeLaDuracion(duracion()) }} por
            cancha{{ arriendo() ? ': ' + arriendo() : '' }} · socio {{ tarifaDelSocio }}
          }
        </p>

        <app-marcador
          modo="elegir"
          [grillas]="visibles()"
          [elegida]="laElegida()"
          [sinVenta]="sinVenta"
          [etiqueta]="etiquetaDeCelda"
          [arriendo]="!esSocio()"
          [bajoLaLinea]="!controlesALaVista()"
          (elegir)="elegirCelda($event)"
        />
      </section>
    }

    <!-- Elegir y reservar quedaron separados: la celda se marca y la barra dice qué cancha
         quedó y con cuánto antes del botón. Al mover, la barra confirma el cambio: desde
         el enlace, con la diferencia (T91); desde "mis reservas", sin plata. -->
    @if (elegido(); as eleccion) {
      <app-barra-fija>
        @if (mover.activo()) {
          <!-- Desde el enlace, solo con lo pagado a la vista: sin eso, el resumen le diría
               al visitante lo que se le dice al socio. Por el modo y no por lo pagado: con
               la barra de reservar, "Reservar" abriría una reserva nueva en vez de cambiar
               la suya. -->
          @let pagado = mover.pagadoPorElEnlace();
          @if (mover.porId() !== null || pagado !== null) {
            <app-resumen-del-cambio
              [cancha]="eleccion.cancha"
              [bloque]="eleccion.bloque"
              [pagadoClp]="pagado"
              [enviando]="mover.enviando()"
              (soltar)="elegido.set(null)"
              (confirmar)="confirmarCambio(eleccion)"
            />
          }
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

    <!-- La hoja de «Cambiar» (T345): los mismos controles de arriba. -->
    <ng-template #hojaDeControles>
      <div class="p-4">
        <ng-container [ngTemplateOutlet]="controles" />
        <div class="mt-4 flex justify-end">
          <button matButton="filled" type="button" (click)="hoja?.dismiss()">Listo</button>
        </div>
      </div>
    </ng-template>

    @if (reservando(); as eleccion) {
      <app-reservar
        [cancha]="eleccion.cancha"
        [bloque]="eleccion.bloque"
        (cerrar)="reservando.set(null)"
        (reservado)="confirmar($event)"
      />
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

  /**
   * La celda que se tocó en la portada (T266): `?cancha=3&inicio=19:00`, con su `fecha`.
   * Mal escrita, nula: no marca nada ni avisa de una hora que nadie eligió.
   */
  private readonly pedida = computed(() => {
    const cancha = Number(this.parametros()?.get('cancha'));
    const inicio = this.parametros()?.get('inicio') ?? '';

    return Number.isInteger(cancha) && cancha > 0 && /^\d{2}:\d{2}$/.test(inicio)
      ? { cancha, inicio }
      : null;
  });

  /**
   * Lo que se le dice a quien llega: que la celda de la portada ya no está libre (T266), o
   * que hoy no queda nada y se le muestra mañana (T268). Se va al elegir una celda.
   */
  protected readonly avisoAlLlegar = signal<string | null>(null);

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

  /** La cancha marcada en el tablero, la que muestra la barra de abajo. */
  protected readonly elegido = signal<CeldaElegible | null>(null);

  private readonly injector = inject(Injector);
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);
  private yaSeMarcoLaDeLaPortada = false;

  /**
   * Marca la de la portada la primera vez que llega su día, y la deja a la vista. Una sola
   * vez: cambiar de día o de duración la suelta como a cualquier otra, y volver no la
   * vuelve a marcar. Con `resolved` y no con `hasValue`: antes de cargar, el valor por
   * omisión es una lista vacía y la daría por tomada.
   */
  private readonly marcarLaDeLaPortada = effect(() => {
    const pedida = this.pedida();
    if (this.yaSeMarcoLaDeLaPortada || !pedida || this.grillas.status() !== 'resolved') return;
    this.yaSeMarcoLaDeLaPortada = true;

    untracked(() => {
      const grilla = this.grillas.value().find(({ cancha }) => cancha.id === pedida.cancha);
      const bloque = grilla?.bloques.find(({ inicio }) => this.hora(inicio) === pedida.inicio);

      if (!grilla || !bloque || this.noSePuedeTomar(bloque)) {
        this.avisoAlLlegar.set('La hora que elegiste ya no está libre: elige otra en el tablero.');
        return;
      }

      this.elegirCelda({ cancha: grilla.cancha, bloque });
      // jsdom no implementa scrollIntoView: en las pruebas, la celda queda donde está.
      afterNextRender(
        () =>
          this.anfitrion.nativeElement
            .querySelector('app-marcador [aria-pressed="true"]')
            ?.scrollIntoView?.({ block: 'center' }),
        { injector: this.injector },
      );
    });
  });

  private yaSeVioHoy = false;

  /**
   * Si hoy ya no queda ninguna libre, pasa a mañana y lo dice (T268, D4). Solo sin fecha en
   * la URL —la de la portada o la de mover mandan— y una sola vez: quien vuelve a "Hoy" en
   * la tira ve hoy. Con `resolved`, como `marcarLaDeLaPortada`.
   */
  private readonly pasarAMananaSiHoyNoQueda = effect(() => {
    if (this.yaSeVioHoy || this.fechaDeLaUrl() !== null || this.grillas.status() !== 'resolved') {
      return;
    }
    this.yaSeVioHoy = true;

    untracked(() => {
      const grillas = this.grillas.value();
      const quedaAlguna = grillas.some(({ bloques }) =>
        bloques.some((bloque) => !this.noSePuedeTomar(bloque)),
      );
      if (this.fecha() !== hoyEnElClub() || grillas.length === 0 || quedaAlguna) return;

      this.fecha.set(mananaEnElClub());
      this.avisoAlLlegar.set('Hoy ya no quedan horas libres: te mostramos mañana.');
    });
  });

  /** La marcada, como la lee el tablero. */
  protected readonly laElegida = computed(() => {
    const eleccion = this.elegido();
    return (
      eleccion && {
        canchaId: eleccion.cancha.id,
        inicio: eleccion.bloque.inicio,
        fin: eleccion.bloque.fin,
      }
    );
  });

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

  /** Si en las canchas a la vista queda alguna hora por empezar: si no, no hay tablero. */
  protected readonly hayHorasPorDelante = computed(() =>
    this.visibles().some(({ bloques }) => bloques.some((bloque) => !yaEmpezo(bloque))),
  );

  /** Ninguna cancha a la vista abre este día. */
  protected readonly sinBloques = computed(() =>
    this.visibles().every(({ bloques }) => bloques.length === 0),
  );

  /**
   * Los inicios que ya pasaron, que van plegados fuera del tablero (decisión 9, TV5.1), con
   * las horas de quien mira que todavía puede reportar (T35).
   */
  protected readonly pasadas = computed(() => {
    const porInicio = new Map<
      number,
      { inicio: string; fin: string; reportables: CeldaElegible[] }
    >();

    for (const { cancha, bloques } of this.visibles()) {
      for (const bloque of bloques) {
        if (!yaEmpezo(bloque)) continue;

        const instante = new Date(bloque.inicio).getTime();
        const fila = porInicio.get(instante) ?? {
          inicio: bloque.inicio,
          fin: bloque.fin,
          reportables: [],
        };
        if (this.reportable(bloque)) fila.reportables.push({ cancha, bloque });
        porInicio.set(instante, fila);
      }
    }

    return [...porInicio].sort(([una], [otra]) => una - otra).map(([, fila]) => fila);
  });

  /**
   * Lo que cuesta el arriendo de la duración elegida, para la línea de arriba: un monto, o
   * "desde" el menor si las canchas o las horas cuestan distinto. Sin la hora prime, que
   * tiene su línea en la leyenda, salvo que solo quede prime. Nulo si no queda ninguna
   * libre: no hay monto que decir.
   */
  protected readonly arriendo = computed(() => {
    const libres = this.visibles()
      .flatMap(({ bloques }) => bloques)
      .filter((bloque) => !this.noSePuedeTomar(bloque));
    const normales = libres.filter((bloque) => !bloque.esPico);
    const montos = new Set(
      (normales.length > 0 ? normales : libres).flatMap(({ montoClp }) =>
        montoClp === null ? [] : [montoClp],
      ),
    );
    if (montos.size === 0) return null;

    const menor = Math.min(...montos);
    return montos.size > 1 ? `desde ${enPesos(menor)}` : enPesos(menor);
  });

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
    const libres = this.visibles()
      .flatMap(({ bloques }) => bloques)
      .filter((bloque) => !bloque.bloqueado && !bloque.reservado && !yaEmpezo(bloque));

    return libres.length > 0 && libres.every((bloque) => this.noSeLeVende(bloque));
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

  /**
   * Por qué una libre no se le vende a quien mira, dicho en su celda y en la leyenda del
   * tablero. Una propiedad y no un método: el tablero la recibe como input y la llama en su
   * `computed`, que así sigue a la duración y a quien mira.
   */
  protected readonly sinVenta = (bloque: BloqueDisponible): string | null => {
    if (!this.noSeLeVende(bloque)) return null;

    // Hay canchas libres, pero esta duración no es para quien mira: "ocupada" sería falso.
    // Al socio, porque el club no se la permite en prime (T213).
    if (this.esSocio()) {
      return this.duracion() === 90
        ? 'En horario prime, solo 1 hora'
        : 'En horario prime, solo 1 hora y media';
    }
    return 'No se arrienda por 1 hora y media';
  };

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

  /**
   * Sin precio de esa duración no se le vende a quien no es socio (T79, T83b); al socio, la
   * duración que el club no le permite en prime (T213).
   */
  private noSeLeVende(bloque: BloqueDisponible): boolean {
    return this.esSocio()
      ? bloque.socioPuede === false
      : bloque.montoClp === null;
  }

  /**
   * Lo que oye quien navega por teclado antes de elegir la celda.
   *
   * **Reemplaza al contenido del botón**, así que lo que no esté acá no existe para
   * quien usa lector de pantalla: la cancha, la hora, lo que le cuesta a quien mira y la
   * hora prime, que no es decoración porque le gasta al socio un cupo semanal del que solo
   * tiene dos. Empieza con "Libre", que es lo que la celda dice (WCAG 2.5.3).
   *
   * Una propiedad y no un método, como `sinVenta`: el tablero la recibe como input.
   */
  protected readonly etiquetaDeCelda = (cancha: Cancha, bloque: BloqueDisponible): string => {
    const que = this.mover.activo() ? 'mover tu reserva a' : 'elegir';

    return (
      `Libre: ${que} la ${cancha.nombre} de ${this.hora(bloque.inicio)} a ` +
      `${this.hora(bloque.fin)}, ${this.costo(bloque)}` +
      (bloque.esPico ? ', hora prime' : '')
    );
  };

  /** Lo que le cuesta la celda a quien mira, para su etiqueta. */
  private costo(bloque: BloqueDisponible): string {
    const monto = bloque.montoClp;
    const pagado = this.mover.pagadoPorElEnlace();

    // Desde el enlace, quien ya pagó oye lo que le costaría el cambio a la cancha que se
    // marcaría, que es la primera: es la pregunta que trae (T91).
    if (pagado !== null && monto !== null) {
      return minuscula(textoDeLaDiferencia(monto, pagado));
    }

    // Sin precio de esa duración no hay arriendo que anunciar: solo lo ve el socio.
    return this.esSocio() || monto === null
      ? `socio ${TARIFA_DEL_SOCIO}`
      : `arriendo ${enPesos(monto)}`;
  }

  /** Marca la cancha que se tocó en el tablero; la barra dice cuál y con cuánto. */
  protected elegirCelda(celda: CeldaElegible): void {
    // Desde el enlace, sin saber cuánto pagó no hay diferencia que decirle: el clic espera
    // a que llegue en vez de marcar una hora que no se puede confirmar.
    if (this.mover.porToken() !== null && this.mover.pagadoPorElEnlace() === null) return;

    this.elegido.set(celda);
    this.avisoAlLlegar.set(null);
  }

  /** El socio mueve sin pagar; desde el enlace, con la diferencia de por medio (T91). */
  protected confirmarCambio(eleccion: CeldaElegible): void {
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

  /** Lo que dice la línea (T345), cada valor con su rótulo (T348, N1): Día «Lun 17 ago»… */
  protected readonly loElegido = computed(() => {
    const mediodia = `${this.fecha()}T12:00:00.000Z`;
    const dia = `${diaCortoEnElClub(mediodia)} ${Number(this.fecha().slice(8, 10))} ${mesCortoEnElClub(mediodia)}`;

    return [
      { rotulo: 'Día', valor: dia },
      { rotulo: 'Duración', valor: duracionCorta(this.duracion()) },
      { rotulo: 'Canchas', valor: filtroCorto(this.filtro()) },
    ];
  });

  /**
   * Si los controles de arriba se ven bajo el encabezado (T349). Empieza en sí: sin el
   * observador (jsdom) o antes de su primera respuesta, en grande la línea no aparece repetida.
   * En el teléfono los controles no se dibujan, el observador responde que no, y da lo mismo:
   * ahí la línea se ve siempre.
   */
  protected readonly controlesALaVista = signal(true);
  private readonly controlesArriba = viewChild.required<ElementRef<HTMLElement>>('controlesArriba');
  private readonly destruir = inject(DestroyRef);

  private readonly mirarLosControles = afterNextRender(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    // Lo que queda bajo el encabezado (65 px con su borde) ya no se ve.
    const observador = new IntersectionObserver(
      ([entrada]) => this.controlesALaVista.set(entrada.isIntersecting),
      { rootMargin: '-65px 0px 0px 0px' },
    );
    observador.observe(this.controlesArriba().nativeElement);
    this.destruir.onDestroy(() => observador.disconnect());
  });

  private readonly hojas = inject(MatBottomSheet);
  private readonly hojaDeControles = viewChild.required<TemplateRef<unknown>>('hojaDeControles');
  /** La hoja abierta, para que «Listo» la cierre. Esc y tocar afuera también la cierran. */
  protected hoja: MatBottomSheetRef | null = null;

  /**
   * Si la grilla se va con la hoja abierta, la hoja se cierra: sus controles son de la grilla.
   * Atrás y adelante ya la cerraban (closeOnNavigation); esto cubre una navegación de la app.
   */
  private readonly cerrarLaHoja = this.destruir.onDestroy(() => this.hoja?.dismiss());

  protected abrirControles(evento: Event): void {
    const boton = evento.currentTarget as HTMLElement;
    this.hoja = this.hojas.open(this.hojaDeControles(), {
      ariaLabel: 'El día, la duración y las canchas',
      // Al botón y no a lo que tenía el foco al abrir: en Safari, tocar un botón no le da el
      // foco, y la hoja lo devolvía al body.
      restoreFocus: boton,
    });
    this.hoja.afterDismissed().subscribe(() => (this.hoja = null));
  }

  protected readonly hora = horaEnElClub;
  protected readonly pesos = enPesos;
  protected readonly tarifaDelSocio = TARIFA_DEL_SOCIO;
  protected readonly etiquetaDeLaDuracion = etiquetaDeLaDuracion;
}

/** "Vale $12.000: …" dicho a mitad de una frase. */
function minuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1).replace(/\.$/, '');
}
