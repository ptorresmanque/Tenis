import {
  Component,
  effect,
  inject,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
  mesCortoEnElClub,
  minutosDe,
} from '../../catalogo-canchas/reloj-del-club';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { descargarIcs } from '../calendario';
import { mensajeDeRechazo, ReservaMia, Reservas } from '../reservas.service';

/**
 * Las horas que el socio tiene tomadas, para moverlas o soltarlas.
 *
 * Las dos ventanas del club llegan resueltas desde la API (`sePuedeModificar` y
 * `devolucionAlCancelar`) y no se recalculan acá: si esta pantalla las decidiera,
 * cambiar el plazo en la configuración la dejaría prometiendo lo que el servidor
 * ya no hace.
 */
@Component({
  selector: 'app-mis-reservas',
  imports: [RouterLink, Aviso, EstadoVacio, Insignia],
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Mis reservas</h1>

    <div role="status" aria-live="polite" class="mt-4">
      @if (reservas.isLoading()) {
        <p class="text-muted-foreground">Buscando tus horas…</p>
      } @else if (reservas.error()) {
        <p class="text-destructive">
          No se pudieron cargar tus reservas. Reintenta en un momento.
        </p>
      } @else if (reservas.value().length === 0) {
        <app-estado-vacio
          icono="sports_tennis"
          titulo="No tienes horas tomadas"
          detalle="Elige una cancha y una hora, y queda reservada al tiro."
        >
          <a routerLink="/disponibilidad" class="boton boton-primario">
            Ver la disponibilidad
          </a>
        </app-estado-vacio>
      }
    </div>

    <!-- Fuera de la región de arriba a propósito: el aviso trae la suya y dos
         regiones vivas anidadas hacen que el lector lea el mensaje dos veces. -->
    @if (aviso(); as texto) {
      <app-aviso variante="info" class="mt-4 block">{{ texto }}</app-aviso>
    }

    <!-- Sin tarjeta y con una línea entre reservas: la caja con borde y sombra
         era la única forma de agrupar que tenía el sitio, y separaba tan poco que
         cuatro reservas se leían como un bloque. -->
    <!-- Con @if y no con la variante empty: de CSS, porque el @for de Angular
         deja nodos de comentario dentro del ul y la pseudo-clase :empty no
         matchea. Sin esto, el border-y dibuja dos líneas pegadas debajo del
         estado vacío y parecen un error de render. -->
    @if (reservas.hasValue() && reservas.value().length > 0) {
    <ul class="mt-6 divide-y divide-border border-y border-border">
      @for (reserva of reservas.value(); track reserva.id) {
        <li class="flex gap-4 py-5">
          <!-- El bloque de fecha del diseño: el día que se juega, del tamaño que
               tiene en la cabeza de quien vino a buscar "la del sábado". -->
          <p
            class="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg
                   bg-selected text-primary"
            aria-hidden="true"
          >
            <span class="font-display text-2xl font-bold">
              {{ diaDelMes(reserva.inicio) }}
            </span>
            <span class="text-xs font-semibold uppercase">
              {{ mesCorto(reserva.inicio) }}
            </span>
          </p>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="titulo-tarjeta">
                {{ reserva.cancha }}
              </h2>
              @if (reserva.estado === 'PENDIENTE_PAGO') {
                <app-insignia variante="aviso">Esperando el pago</app-insignia>
              } @else {
                <app-insignia variante="exito">Confirmada</app-insignia>
              }
              @if (reserva.esPico) {
                <!-- Ámbar, como el rótulo "Pico" del marcador y de las tarifas. -->
                <app-insignia variante="aviso" icono="trending_up">Hora pico</app-insignia>
              }
            </div>

            <!-- La hora en un rótulo, como en la grilla (TV5.3): campo, o ámbar
                 suave si es hora pico. Es el dato con el que alguien busca su
                 reserva. -->
            <p
              class="rotulo-hora mt-2 inline-flex px-2 py-1 text-2xl"
              [class.rotulo-hora-pico]="reserva.esPico"
            >
              {{ hora(reserva.inicio) }}–{{ hora(reserva.fin) }}
            </p>
            <p class="text-muted-foreground">{{ dia(reserva.inicio) }}</p>
            <p class="mt-1 text-sm text-muted-foreground">Folio {{ reserva.folio }}</p>

          @if (porCancelar() === reserva.id) {
            <!-- La confirmacion se abre en la propia fila: es la consecuencia de
                 esta reserva y no de otra, y asi no hay que atrapar el foco. -->
            <app-aviso variante="aviso" [urgente]="true" class="mt-3 block">
              {{ consecuencia(reserva) }}
            </app-aviso>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="boton boton-destructivo boton-chico"
                [disabled]="enviando()"
                (click)="confirmarCancelacion(reserva)"
              >
                Sí, cancelar
              </button>
              <button
                type="button"
                class="boton boton-texto boton-chico"
                (click)="porCancelar.set(null)"
              >
                Mejor no
              </button>
            </div>
          } @else {
            @if (!reserva.sePuedeModificar) {
              <app-aviso variante="info" class="mt-3 block">
                Faltan menos de 6 horas: esta hora ya no se puede cambiar.
              </app-aviso>
            }

            <div class="mt-3 flex flex-wrap gap-2">
              @if (reserva.sePuedeModificar) {
                <a
                  routerLink="/disponibilidad"
                  [queryParams]="{ mover: reserva.id, duracion: duracionDeLaGrilla(reserva) }"
                  class="boton boton-primario boton-chico"
                >
                  <span class="icono text-base" aria-hidden="true">schedule</span>
                  Cambiar hora o duración
                </a>
              }
              <button
                type="button"
                class="boton boton-texto boton-chico"
                (click)="agregarAlCalendario(reserva)"
              >
                <span class="icono text-base" aria-hidden="true">event</span>
                Agregar al calendario
              </button>
              <button
                type="button"
                class="boton boton-secundario boton-chico"
                (click)="porCancelar.set(reserva.id)"
              >
                <span class="icono text-base" aria-hidden="true">cancel</span>
                Cancelar
              </button>
            </div>
          }
          </div>
        </li>
      }
    </ul>
    }
  `,
})
export class MisReservas {
  private readonly servicio = inject(Reservas);

  protected readonly reservas = resource({
    loader: () => this.servicio.mias(),
    defaultValue: [] as ReservaMia[],
  });

  /** Cuál está esperando confirmación de cancelación. */
  protected readonly porCancelar = signal<number | null>(null);
  protected readonly enviando = signal(false);
  protected readonly aviso = signal<string | null>(null);

  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** El folio que llega desde la confirmación con "Cancelar esta reserva". */
  private readonly folioPorCancelar = toSignal(this.ruta.queryParamMap);

  /**
   * El atajo del enlace ya se usó.
   *
   * Sin esta marca, el `effect` volvía a abrir la confirmación cada vez que la
   * lista cambiaba: quien apretaba "Mejor no" y después cancelaba otra hora se
   * encontraba de nuevo con el diálogo que ya había descartado.
   */
  private atajoConsumido = false;

  constructor() {
    effect(() => {
      const folio = this.folioPorCancelar()?.get('cancelar');

      if (this.atajoConsumido || !folio) return;

      // Hasta que la lista no esté resuelta, "no está" no significa nada: mientras
      // carga siempre está vacía. Con `error` tampoco se afirma nada, que la
      // pantalla ya avisa que no se pudieron cargar.
      if (this.reservas.status() !== 'resolved') return;

      // El folio se traduce a id acá porque la confirmación no conoce el id: lo
      // único que le llega por la URL es el folio, y pedirle al servidor un
      // endpoint nuevo para resolverlo sería backend para ahorrarse tres líneas.
      const reserva = this.reservas.value().find((una) => una.folio === folio);

      this.atajoConsumido = true;
      untracked(() => {
        // El atajo es de un solo uso y la marca de arriba muere con la pestaña. Si
        // el folio se queda en la URL, quien cancela y recarga para comprobarlo
        // vuelve a caer acá con su hora ya fuera de la lista, y lee que no se
        // canceló nada justo después de haberla cancelado.
        void this.router.navigate([], {
          relativeTo: this.ruta,
          queryParams: {},
          replaceUrl: true,
        });

        if (reserva) {
          this.porCancelar.set(reserva.id);
          return;
        }

        // **El atajo no puede fallar en silencio.** La confirmación de una reserva
        // sigue abriéndose con su token mucho después —es una URL que la persona
        // guarda—, así que "Cancelar esta reserva" llega acá cuando esa hora ya
        // terminó y salió de la lista. Sin este aviso, quien lo apretaba aterrizaba
        // en "No tienes horas tomadas" y se iba creyendo que había cancelado: la
        // hora seguía CONFIRMADA y gastando su cupo del día.
        this.aviso.set(
          `La reserva ${folio} no está entre tus horas próximas, así que no se ` +
            'canceló nada. Si ya se jugó, el cupo de ese día queda usado igual; si ' +
            'crees que es un error, escribe al club con ese folio.',
        );
      });
    });
  }

  /**
   * Qué pasa si cancela, **dicho antes de que apriete**.
   *
   * La ventana de reembolso se mide contra el bloque que se compró y no contra el
   * reagendado, así que quien movió su hora puede estar fuera de plazo aunque la vea
   * lejos. Sin este aviso se entera cuando ya no hay vuelta atrás.
   */
  protected consecuencia(reserva: ReservaMia): string {
    if (!reserva.pagada) {
      return 'Tu hora vuelve a la grilla y recuperas el cupo del día.';
    }

    return reserva.devolucionAlCancelar
      ? 'Cancelamos la hora y te devolvemos lo que pagaste, al mismo medio de pago.'
      : // "La hora que compraste" y no "esta hora": si la reserva fue movida, el plazo
        // corre contra el bloque original, que puede estar mucho más cerca que el que
        // se ve en la tarjeta. Decir "faltan menos de 24 horas" a secas contradice lo
        // que la persona tiene delante.
        'La devolución necesita 24 horas de anticipación sobre la hora que ' +
          'compraste, y ese plazo ya pasó: pierdes lo que pagaste.';
  }

  protected async confirmarCancelacion(reserva: ReservaMia): Promise<void> {
    this.enviando.set(true);
    this.aviso.set(null);

    try {
      const resultado = await this.servicio.cancelar(reserva.id);

      // Se saca de la lista en vez de recargarla: el servidor ya dijo que quedó
      // cancelada, y una consulta más solo agrega una espera.
      this.reservas.value.update((lista) =>
        lista.filter((otra) => otra.id !== reserva.id),
      );
      this.porCancelar.set(null);
      this.aviso.set(
        resultado.huboDevolucion
          ? `Cancelamos la reserva ${resultado.folio} y la devolución ya está en camino.`
          : `Cancelamos la reserva ${resultado.folio}.`,
      );
    } catch (falla) {
      const rechazo = mensajeDeRechazo(falla);

      this.aviso.set(
        rechazo.motivo === 'ERROR'
          ? 'No se pudo cancelar la reserva. Reintenta en un momento.'
          : rechazo.mensaje,
      );
    } finally {
      this.enviando.set(false);
    }
  }

  protected readonly hora = horaEnElClub;

  /**
   * Mover conserva la duración, así que la grilla tiene que buscar horas de esa duración.
   * Nulo deja afuera el parámetro: 1 hora es la de siempre.
   */
  protected duracionDeLaGrilla(reserva: ReservaMia): 90 | null {
    return minutosDe(reserva) === 90 ? 90 : null;
  }
  protected dia(instante: string): string {
    return diaEnPalabras(fechaEnElClub(instante));
  }

  /**
   * Se lleva la hora al calendario del teléfono.
   *
   * Un `.ics` descargado y no un enlace a Google Calendar: funciona con el
   * calendario que la persona use, incluido el del iPhone, y no manda los datos
   * de la reserva a un tercero de paso.
   */
  protected agregarAlCalendario(reserva: ReservaMia): void {
    descargarIcs({
      titulo: `${reserva.cancha} · FEDAL Tennis Center`,
      descripcion: `Folio ${reserva.folio}. Llega 10 minutos antes.`,
      inicio: reserva.inicio,
      fin: reserva.fin,
      folio: reserva.folio,
    });
  }

  /** El número del bloque de fecha: sale del día del club, no del navegador. */
  protected diaDelMes(instante: string): string {
    return String(Number(fechaEnElClub(instante).slice(8)));
  }

  /** "ago", debajo del número. */
  protected readonly mesCorto = mesCortoEnElClub;
}
