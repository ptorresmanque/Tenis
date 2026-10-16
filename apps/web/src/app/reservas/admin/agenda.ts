import {
  Component,
  computed,
  DestroyRef,
  inject,
  resource,
  signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatFabButton } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Disponibilidad } from '../../catalogo-canchas/disponibilidad';
import { SelectorDeDia } from '../../catalogo-canchas/grilla/selector-de-dia';
import { hoyEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { ClaseDelDia, Clases } from '../../clases/clases.service';
import { Auth } from '../../core/auth/auth';
import { DescargarCsv } from '../../reportes/descargar-csv';
import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { LO_HECHO } from '../../ui/material';
import { Agenda, BloqueoDelDia, ReservaDelDia } from './agenda.service';
import { FichaDeLaReserva } from './ficha-de-la-reserva';
import { NuevaReserva } from './nueva-reserva';
import { TableroDeLaAgenda } from './tablero-de-la-agenda';

/**
 * El día del club, para quien atiende el mesón.
 *
 * **Se repuebla sola cuando entra una reserva** (`SPEC.md` § Success Criteria 2): el
 * servidor avisa por Server-Sent Events y la pantalla vuelve a pedir el día. El aviso
 * trae solo la fecha, así que lo que se muestra sale siempre de la misma consulta y no
 * de un evento que podría traer una versión distinta.
 */
@Component({
  selector: 'app-agenda-del-dia',
  // Espacio al final para que el FAB no tape la última fila del tablero (A9).
  host: { class: 'block', '[class.pb-24]': 'puedeTomarHoras()' },
  imports: [
    MatFabButton,
    MatChipsModule,
    MatIcon,
    DescargarCsv,
    EstadoVacio,
    FichaDeLaReserva,
    NuevaReserva,
    SelectorDeDia,
    TableroDeLaAgenda,
    Esqueleto,
  ],
  template: `
    <!-- El titular y las pestañas van en la pantalla madre (T285, panel-de-la-agenda). Acá
         queda lo de la agenda: que está en vivo y su planilla. Los controles del día van
         debajo, los mismos de disponibilidad (T271). -->
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

    <!-- Tomar una hora es del admin (T221): el gestor mira el día y anota. Es la acción que
         crea, y va en el FAB como en el resto del panel (SPEC-panel.md D15). -->
    @if (puedeTomarHoras()) {
      <button
        matFab
        extended
        type="button"
        class="fab-de-la-pantalla"
        (click)="tomandoHora.set(SIN_FRANJA)"
      >
        <mat-icon aria-hidden="true">add</mat-icon>
        Nueva reserva
      </button>
    }

    <!-- Los controles del día de disponibilidad (D2): la semana a un toque, «Otro día» y
         el día en palabras. Duración y canchas no van: la agenda muestra todo el día. -->
    <app-selector-de-dia [(fecha)]="fechaActual" />

    @if (puedeTomarHoras() && tomandoHora(); as franja) {
      <app-nueva-reserva
        [fecha]="fechaActual()"
        [cancha]="franja.canchaId"
        [inicio]="franja.inicio"
        (cerrar)="tomandoHora.set(null)"
        (creada)="anunciarCreada($event)"
      />
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
      EL DÍA, EN EL TABLERO (T271, D2).

      La cara de disponibilidad, para el mesón: una fila por media hora y una columna
      por cancha, sobre la misma banda de campo. Antes era una lista de tarjetas; lo que
      decía cada tarjeta está ahora en la ficha de la reserva, que se abre al tocarla.
    -->
    @if (grillasSeguras().length > 0) {
      <section
        class="-mx-4 mt-4 bg-campo px-4 py-6 text-on-campo sm:mx-0 sm:rounded-region sm:px-6"
        aria-label="El día del club"
      >
        <app-tablero-de-la-agenda
          [grillas]="grillasSeguras()"
          [reservas]="reservasSeguras()"
          [clases]="clasesSeguras()"
          [bloqueos]="bloqueosSeguros()"
          [puedeTomar]="puedeTomarHoras()"
          (abrir)="idDeLaFicha.set($event.id)"
          (tomar)="tomandoHora.set($event)"
        />
      </section>
    }

    @if (laFicha(); as reserva) {
      <app-ficha-de-la-reserva
        [reserva]="reserva"
        (cerrar)="idDeLaFicha.set(null)"
        (cambio)="reservas.reload()"
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

  /** El mesón es del admin; el gestor ve el mismo día sin poder tomar horas (T221). */
  protected readonly puedeTomarHoras = computed(
    () => this.usuario()?.esAdmin === true,
  );

  readonly fechaActual = signal(hoyEnElClub());

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
   * Las canchas del día con su horario, para el tablero (T271): la misma consulta que
   * disponibilidad. No se repuebla con los avisos: el horario no cambia porque entre una
   * reserva.
   */
  protected readonly grillas = resource({
    params: () => ({ fecha: this.fechaActual() }),
    loader: ({ params }) => this.disponibilidad.delDia(params.fecha),
    defaultValue: [],
  });

  /** Las canchas cerradas del día, con su rango exacto (T270). */
  private readonly bloqueos = resource({
    params: () => ({ fecha: this.fechaActual(), recarga: this.recargas() }),
    loader: ({ params }) => this.agenda.bloqueosDelDia(params.fecha),
    defaultValue: [] as BloqueoDelDia[],
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
  protected readonly grillasSeguras = computed(() =>
    this.grillas.hasValue() ? this.grillas.value() : [],
  );
  /** Sin los cierres, el tablero igual sirve: se dibuja sin rayas. */
  protected readonly bloqueosSeguros = computed(() =>
    this.bloqueos.hasValue() ? this.bloqueos.value() : [],
  );

  /**
   * La reserva cuya ficha está abierta. Por su id y no el objeto: al anotar una
   * observación el día se vuelve a pedir, y la ficha tiene que mostrar la nueva.
   */
  protected readonly idDeLaFicha = signal<number | null>(null);
  protected readonly laFicha = computed(() => {
    const id = this.idDeLaFicha();
    return id === null ? null : (this.reservasSeguras().find((reserva) => reserva.id === id) ?? null);
  });

  /** Cambia con cada aviso del servidor y así vuelve a disparar el `resource`. */
  private readonly recargas = signal(0);

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
   * El formulario del mesón está abierto: desde la cabecera, sin franja; desde una franja
   * libre del tablero, con su cancha y su hora (T272). Solo el admin llega a abrirlo.
   */
  protected readonly tomandoHora = signal<FranjaPedida | null>(null);
  protected readonly SIN_FRANJA: FranjaPedida = { canchaId: null, inicio: null };

  /**
   * La lista no se recarga acá a mano: la reserva nueva dispara el mismo aviso del
   * servidor que las que entran por la web, y la agenda ya se repuebla con eso. Lo hecho
   * se confirma con el snackbar (T283): el tablero ya la muestra, y un aviso fijo arriba
   * solo empujaba la tabla.
   */
  protected anunciarCreada(folio: string): void {
    this.tomandoHora.set(null);
    this.snackBar.open(`Hora tomada. Folio ${folio}.`, undefined, LO_HECHO);
  }

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
}

/** La franja desde la que se abre «Nueva reserva»: nula en lo que se elige en el formulario. */
interface FranjaPedida {
  canchaId: number | null;
  inicio: string | null;
}
