import {
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  BloqueDisponible,
  Cancha,
  Disponibilidad,
  DuracionMin,
} from '../../catalogo-canchas/disponibilidad';
import { ControlesDelDia, pasaElFiltro } from '../../catalogo-canchas/grilla/controles-del-dia';
import { MoverReserva } from '../../catalogo-canchas/grilla/mover-reserva';
import { ResumenDeLaEleccion } from '../../catalogo-canchas/grilla/resumen-de-la-eleccion';
import { ResumenDelCambio } from '../../catalogo-canchas/grilla/resumen-del-cambio';
import { CeldaElegible, Marcador } from '../../catalogo-canchas/marcador';
import {
  fechaEnElClub,
  hoyEnElClub,
  horaEnElClub,
  minutosDe,
} from '../../catalogo-canchas/reloj-del-club';
import { ClaseDelDia, Clases, cupoEnPalabras, queClaseEs } from '../../clases/clases.service';
import { Auth } from '../../core/auth/auth';
import { DescargarCsv } from '../../reportes/descargar-csv';
import { Aviso } from '../../ui/aviso';
import { BarraFija } from '../../ui/barra-fija';
import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { LO_HECHO } from '../../ui/material';
import { Agenda, ReservaDelDia } from './agenda.service';
import { FichaDeLaReserva } from './ficha-de-la-reserva';
import { NuevaReserva } from './nueva-reserva';

/**
 * El día del club, para quien atiende el mesón.
 *
 * **Es la página de reservas del sitio** (T390, `SPEC-panel.md` § Reservas del panel): los mismos
 * controles del día, el mismo tablero, la misma barra con lo elegido y un diálogo como el de
 * `/disponibilidad`. La diferencia es que el tablero dice de quién es cada hora y cómo se paga, y
 * la reserva se toca para abrir su ficha. Lo propio del panel queda arriba: que está en vivo, la
 * planilla y las tres cifras.
 *
 * **Se repuebla sola cuando entra una reserva** (`SPEC.md` § Success Criteria 2): el servidor
 * avisa por Server-Sent Events y la pantalla vuelve a pedir el día, el tablero incluido. El aviso
 * trae solo la fecha, así que lo que se muestra sale siempre de las mismas consultas.
 */
@Component({
  selector: 'app-agenda-del-dia',
  host: { class: 'block' },
  // Uno por página, como en la grilla del sitio: el modo mover vive en la dirección (T392).
  providers: [MoverReserva],
  imports: [
    Aviso,
    BarraFija,
    ControlesDelDia,
    DescargarCsv,
    Esqueleto,
    EstadoVacio,
    FichaDeLaReserva,
    Marcador,
    MatButton,
    MatChipsModule,
    MatIcon,
    MatListModule,
    NuevaReserva,
    ResumenDeLaEleccion,
    ResumenDelCambio,
  ],
  template: `
    <!-- El titular y las pestañas van en la pantalla madre (T285, panel-de-la-agenda). Acá
         queda lo de la agenda: que está en vivo y su planilla. -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <!-- La agenda se repuebla sola con los avisos del servidor. Decirlo evita que alguien
           recargue por las dudas cada dos minutos. -->
      <mat-chip-set class="insignias">
        <mat-chip class="insignia exito">
          <mat-icon matChipAvatar aria-hidden="true">sensors</mat-icon>
          En vivo
        </mat-chip>
      </mat-chip-set>

      <!-- El día que se está mirando, en una planilla (T273): lo bajan el admin y el
           gestor, como los reportes. -->
      <app-descargar-csv [url]="'/api/admin/agenda.csv?fecha=' + fechaActual()" />
    </div>

    <!-- Los controles de disponibilidad (T390): el día, la duración y las canchas. El día queda
         en la dirección, para que el enlace desde Finanzas y recargar lo conserven. -->
    <app-controles-del-dia
      class="mt-4"
      [(fecha)]="fechaActual"
      (fechaChange)="irAlDia($event)"
      [duracion]="duracion()"
      [(filtro)]="filtro"
      (cambiarDuracion)="elegirDuracion($event)"
    />

    @if (mover.activo()) {
      <!-- Modificar (T392): el próximo clic en una libre mueve la reserva en vez de tomar una
           nueva, y se dice arriba, como en el sitio. La salida está al lado. -->
      <div role="status" class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-3">
        <p class="font-medium">
          Elige la nueva hora para la reserva de {{ laQueSeMueve()?.nombre ?? 'esta reserva' }}.
          La que tenía queda libre.
        </p>
        <button matButton="outlined" type="button" (click)="volverSinCambiar()">
          Volver sin cambiar
        </button>
      </div>
    }
    @if (mover.error(); as falla) {
      <app-aviso variante="error" class="mt-3 block">
        La reserva no se puede mover: {{ falla }}
      </app-aviso>
    }

    @if (reservasSeguras().length > 0) {
      <ul class="mt-6 grid gap-3 sm:grid-cols-3">
        @for (dato of resumenDelDia(); track dato.titulo) {
          <li>
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <mat-icon class="text-primary" aria-hidden="true">{{ dato.icono }}</mat-icon>
              {{ dato.titulo }}
            </p>
            <p class="mt-1 font-display text-3xl font-bold">{{ dato.valor }}</p>
          </li>
        }
      </ul>
    }

    <div role="status" aria-live="polite" class="mt-6">
      @if (reservas.isLoading() || grillas.isLoading()) {
        <app-esqueleto [filas]="6" etiqueta="Buscando las reservas del día…" />
      } @else if (reservas.error() || clases.error() || grillas.error()) {
        <p class="text-destructive">
          No se pudo cargar la agenda. Reintenta en un momento.
        </p>
      } @else if (reservasSeguras().length + clasesSeguras().length === 0) {
        <!-- Sobre el día entero y no solo sobre las reservas: con una clase
             agendada, "no hay reservas" se leía justo encima de la clase. -->
        <app-estado-vacio
          icono="event_available"
          titulo="No hay nada agendado este día"
          detalle="Las reservas que entren aparecen acá solas, sin recargar."
        />
      } @else {
        <!-- Lo anuncia para quien no ve el tablero: es la misma región que cambia
             sola cuando entra una reserva nueva. -->
        <p class="sr-only">{{ resumen() }}</p>
      }
    </div>

    <!--
      EL DÍA, EN EL TABLERO DEL SITIO (T390).

      El mismo de /disponibilidad, sobre la misma banda de campo, con el día entero: lo que ya
      pasó se ve, para abrir la reserva de la mañana y ver su pago. Al admin, la libre se elige y
      la barra dice cuál; al gestor no le ofrece nada (T221).
    -->
    @if (visibles().length > 0) {
      <section
        class="-mx-4 mt-4 bg-campo px-4 py-6 text-on-campo sm:mx-0 sm:rounded-region sm:px-6"
        aria-label="El día del club"
      >
        <app-marcador
          modo="elegir"
          [grillas]="visibles()"
          [reservas]="reservasDelTablero()"
          [todoElDia]="true"
          [puedeElegir]="puedeTomarHoras()"
          [elegida]="laElegida()"
          [etiqueta]="etiquetaDeCelda"
          (elegir)="elegido.set($event)"
          (abrirReserva)="idDeLaFicha.set($event)"
        />
      </section>
    }

    <!-- Las clases del día con su profesor y su nivel: el tablero las marca en su cancha, sin
         decir de quién son, y la del gimnasio no tiene cancha donde ir (A4). -->
    @if (clasesSeguras().length > 0) {
      <section data-clases-del-dia class="mt-6">
        <h2 class="font-display text-lg font-bold tracking-wide uppercase">Clases del día</h2>
        <mat-list aria-label="Clases del día">
          @for (clase of clasesSeguras(); track clase.id) {
            <mat-list-item lines="2">
              <mat-icon matListItemIcon aria-hidden="true">school</mat-icon>
              <span matListItemTitle>
                {{ hora(clase.inicio) }}–{{ hora(clase.fin) }} · {{ clase.lugar }} · Clase ·
                {{ queClaseEs(clase) }}
              </span>
              <span matListItemLine>
                {{ clase.profesor }} · {{ cupoEnPalabras(clase.cupoMaximo) }}
              </span>
            </mat-list-item>
          }
        </mat-list>
      </section>
    }

    <!-- Lo elegido y «Reservar», como en el sitio. Pegada abajo dentro del panel, no a la
         ventana: fija a todo el ancho quedaba encima del menú lateral. -->
    @if (elegido(); as eleccion) {
      <app-barra-fija enElFlujo>
        @if (mover.activo()) {
          <!-- Sin plata de por medio: el club mueve sin cobrar ni devolver (T392). -->
          <app-resumen-del-cambio
            [cancha]="eleccion.cancha"
            [bloque]="eleccion.bloque"
            [pagadoClp]="null"
            [detalle]="'Mover la reserva de ' + (laQueSeMueve()?.nombre ?? 'esta reserva') + '.'"
            [enviando]="mover.enviando()"
            (soltar)="elegido.set(null)"
            (confirmar)="confirmarCambio(eleccion)"
          />
        } @else {
          <app-resumen-de-la-eleccion
            [cancha]="eleccion.cancha"
            [bloque]="eleccion.bloque"
            (soltar)="elegido.set(null)"
            (reservar)="reservando.set(eleccion)"
          />
        }
      </app-barra-fija>
    }

    @if (puedeTomarHoras() && reservando(); as eleccion) {
      <app-nueva-reserva
        [cancha]="eleccion.cancha"
        [bloque]="eleccion.bloque"
        (cerrar)="reservando.set(null)"
        (creada)="anunciarCreada($event)"
      />
    }

    @if (laFicha(); as reserva) {
      <app-ficha-de-la-reserva
        [reserva]="reserva"
        [esAdmin]="puedeTomarHoras()"
        (cerrar)="cerrarFicha()"
        (cambio)="reservas.reload()"
        (cancelada)="anunciarCancelada()"
        (modificar)="empezarAMover($event)"
      />
    }
  `,
})
export class AgendaDelDia {
  private readonly agenda = inject(Agenda);
  private readonly clasesApi = inject(Clases);
  private readonly disponibilidad = inject(Disponibilidad);
  private readonly usuario = inject(Auth).usuario;
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly parametros = toSignal(this.ruta.queryParamMap);
  protected readonly mover = inject(MoverReserva);

  /** El mesón es del admin; el gestor ve el mismo día sin poder tomar horas (T221). */
  protected readonly puedeTomarHoras = computed(
    () => this.usuario()?.esAdmin === true,
  );

  /**
   * El día que se mira: el de la dirección (`?fecha=`), o hoy. A diferencia del sitio, uno
   * pasado también vale: el club revisa lo que se jugó.
   */
  readonly fechaActual = linkedSignal(() => {
    const pedida = this.parametros()?.get('fecha');
    return pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoyEnElClub();
  });

  /** De cuánto es la hora que se busca, como en el sitio: decide qué inicios quedan libres. */
  protected readonly duracion = signal<DuracionMin>(60);
  protected readonly filtro = signal('todas');

  /** Cambia con cada aviso del servidor y así vuelve a disparar cada `resource`. */
  private readonly recargas = signal(0);

  protected readonly reservas = resource({
    params: () => ({ fecha: this.fechaActual(), recarga: this.recargas() }),
    loader: ({ params }) => this.agenda.delDia(params.fecha),
    defaultValue: [] as ReservaDelDia[],
  });

  /**
   * Las clases del día, que ocupan cancha igual que una reserva.
   *
   * Dos consultas y no una: `clases` y `reservas` no se conocen —lo dice el contrato
   * de `SPEC-clases.md`— y juntarlas en un servicio del servidor obligaría a uno de
   * los dos módulos a depender del otro. Se juntan acá, que es donde se miran juntas.
   */
  protected readonly clases = resource({
    params: () => ({ fecha: this.fechaActual(), recarga: this.recargas() }),
    loader: ({ params }) => this.clasesApi.delDia(params.fecha),
    defaultValue: [] as ClaseDelDia[],
  });

  /**
   * Las canchas del día con sus horas, para el tablero: la misma consulta que disponibilidad.
   * Se vuelve a pedir con cada aviso (T390): la hora que se tomó o se canceló cambia lo que se
   * puede elegir.
   */
  protected readonly grillas = resource({
    params: () => ({
      fecha: this.fechaActual(),
      duracion: this.duracion(),
      recarga: this.recargas(),
      porId: this.mover.porId(),
      porToken: null,
    }),
    // Al mover, el día sin contar la reserva que se mueve: alargarla en su lugar se ofrece (T87).
    loader: ({ params }) =>
      this.mover.grillaDelDia(params) ??
      this.disponibilidad.delDia(params.fecha, params.duracion),
    defaultValue: [],
  });

  /**
   * Lo cargado, leído sin reventar: `value()` lanza si el `resource` falló. Cada sección
   * pregunta aparte por `error()`.
   */
  protected readonly reservasSeguras = computed(() =>
    this.reservas.hasValue() ? this.reservas.value() : [],
  );
  protected readonly clasesSeguras = computed(() =>
    this.clases.hasValue() ? this.clases.value() : [],
  );

  /** La reserva que se está moviendo, para decir de quién es (T392). */
  protected readonly laQueSeMueve = computed(() =>
    this.reservasSeguras().find(({ id }) => id === this.mover.porId()),
  );

  /** Las del tablero: sin la que se mueve, cuyas filas quedan libres para elegirlas. */
  protected readonly reservasDelTablero = computed(() =>
    this.reservasSeguras().filter(({ id }) => id !== this.mover.porId()),
  );

  /** Las canchas que pasan el filtro, como en el sitio (`pasaElFiltro`). */
  protected readonly visibles = computed(() =>
    (this.grillas.hasValue() ? this.grillas.value() : []).filter(({ cancha }) =>
      pasaElFiltro(cancha, this.filtro()),
    ),
  );

  /** La libre marcada en el tablero, la que muestra la barra de abajo. */
  protected readonly elegido = signal<CeldaElegible | null>(null);
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

  /** La que ya pasó por «Reservar» y tiene el diálogo abierto encima. */
  protected readonly reservando = signal<CeldaElegible | null>(null);

  /**
   * La reserva cuya ficha está abierta. Por su id y no el objeto: al anotar una observación el
   * día se vuelve a pedir, y la ficha tiene que mostrar la nueva. Parte en `?reserva=`, el
   * enlace desde Finanzas › Pagos (R10).
   */
  protected readonly idDeLaFicha = linkedSignal(() => {
    const id = Number(this.parametros()?.get('reserva'));
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  protected readonly laFicha = computed(() => {
    const id = this.idDeLaFicha();
    return id === null ? null : (this.reservasSeguras().find((reserva) => reserva.id === id) ?? null);
  });

  constructor() {
    const suscripcion = this.agenda.avisos.subscribe((aviso) => {
      // Solo el día que se está mirando: quien revisa el sábado no quiere que la
      // pantalla se le repueble porque entró una reserva para el martes.
      if (aviso.fecha === this.fechaActual()) {
        this.recargas.update((veces) => veces + 1);
      }
    });

    // Cierra el canal al salir de la pantalla; si no, queda una conexión abierta por
    // cada vez que se entró.
    inject(DestroyRef).onDestroy(() => suscripcion.unsubscribe());
  }

  /** Cambiar de día suelta lo marcado, y el día queda en la dirección. */
  protected irAlDia(fecha: string): void {
    this.elegido.set(null);
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { fecha },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Lo marcado era un bloque de la otra duración: su fin ya no vale. */
  protected elegirDuracion(valor: string): void {
    this.elegido.set(null);
    this.duracion.set(valor === '90' ? 90 : 60);
  }

  /** Cerrar la ficha que abrió el enlace la saca también de la dirección: recargar no la reabre. */
  protected cerrarFicha(): void {
    this.idDeLaFicha.set(null);
    if (this.parametros()?.has('reserva')) {
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { reserva: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  /**
   * La lista no se recarga acá a mano: la reserva nueva dispara el mismo aviso del servidor que
   * las que entran por la web, y la agenda ya se repuebla con eso. Lo hecho se confirma con el
   * snackbar (T283), y lo marcado se suelta: esa hora ya no está libre.
   */
  protected anunciarCreada(folio: string): void {
    this.reservando.set(null);
    this.elegido.set(null);
    this.snackBar.open(`Hora tomada. Folio ${folio}.`, undefined, LO_HECHO);
  }

  /**
   * La reserva cancelada desde su ficha (T391): la ficha se cierra y el día se vuelve a pedir al
   * tiro, sin esperar el aviso del servidor, que igual llega. Lo que pasó con la plata lo dice la
   * ficha, que puede irse antes de que llegue la respuesta.
   */
  protected anunciarCancelada(): void {
    this.cerrarFicha();
    this.recargas.update((veces) => veces + 1);
  }

  /**
   * «Modificar» desde la ficha (T392): la ficha se cierra y el tablero pasa a modo mover en el día
   * y con la duración de la reserva. Va en la dirección, como en el sitio: recargar no lo pierde.
   */
  protected empezarAMover(reserva: ReservaDelDia): void {
    this.cerrarFicha();
    this.elegido.set(null);
    this.duracion.set(minutosDe(reserva) === 90 ? 90 : 60);
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { mover: reserva.id, fecha: fechaEnElClub(reserva.inicio), reserva: null },
      queryParamsHandling: 'merge',
    });
  }

  /** Sale del modo mover sin tocar la reserva. */
  protected volverSinCambiar(): void {
    this.elegido.set(null);
    void this.salirDeMover();
  }

  /**
   * Mueve la reserva a la hora marcada. Al terminar, el admin sigue en la agenda, con el día al
   * tiro y el aviso; si la API la rechaza, `mover.error()` lo dice arriba y la hora queda marcada.
   */
  protected confirmarCambio(eleccion: CeldaElegible): void {
    const folio = this.laQueSeMueve()?.folio;
    void this.mover.moverAlTiro(eleccion, async () => {
      this.elegido.set(null);
      await this.salirDeMover();
      this.recargas.update((veces) => veces + 1);
      this.snackBar.open(folio ? `Reserva ${folio} movida.` : 'Reserva movida.', undefined, LO_HECHO);
    });
  }

  private salirDeMover(): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { mover: null },
      queryParamsHandling: 'merge',
    });
  }

  /** Lo que oye quien navega por teclado antes de elegir la libre: empieza con lo que dice. */
  protected readonly etiquetaDeCelda = (cancha: Cancha, bloque: BloqueDisponible): string =>
    `Libre: tomar la ${cancha.nombre} de ${horaEnElClub(bloque.inicio)} a ${horaEnElClub(bloque.fin)}`;

  protected readonly resumen = () => {
    const total = this.reservasSeguras().length;
    const clases = this.clasesSeguras().length;
    const reservas = `${total} ${total === 1 ? 'reserva' : 'reservas'}`;

    // Las clases se nombran solo cuando las hay: "y 0 clases" es ruido en cada
    // anuncio para quien escucha la pantalla todo el día.
    return clases === 0
      ? `${reservas} este día.`
      : `${reservas} y ${clases} ${clases === 1 ? 'clase' : 'clases'} este día.`;
  };

  /**
   * Las tres cuentas del día, sacadas de las reservas que ya llegaron.
   *
   * El diseño pide además ocupación e ingresos. Ninguno de los dos sale de este
   * endpoint —la agenda no trae montos ni el total de bloques del día—, y
   * calcularlos a ojo sería inventarle plata al club.
   */
  protected readonly resumenDelDia = computed(() => {
    const reservas = this.reservasSeguras();

    return [
      { titulo: 'Reservas', icono: 'book_online', valor: reservas.length },
      {
        titulo: 'De socios',
        icono: 'group',
        valor: reservas.filter((reserva) => reserva.esSocio).length,
      },
      {
        titulo: 'Esperando el pago',
        icono: 'schedule',
        valor: reservas.filter((reserva) => reserva.estado === 'PENDIENTE_PAGO')
          .length,
      },
    ];
  });

  protected readonly hora = horaEnElClub;
  protected readonly queClaseEs = queClaseEs;
  protected readonly cupoEnPalabras = cupoEnPalabras;
}
