import {
  Component,
  computed,
  DestroyRef,
  inject,
  resource,
  signal,
} from '@angular/core';

import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
  hoyEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { ClaseDelDia, Clases, NIVELES } from '../../clases/clases.service';
import { Agenda, ReservaDelDia } from './agenda.service';
import { NuevaReserva } from './nueva-reserva';
import { EnlaceTelefonoPipe, TelefonoPipe } from '../../core/telefono';
import { CampoFecha } from '../../ui/campo-fecha';

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
  imports: [Aviso, EstadoVacio, Insignia, NuevaReserva, EnlaceTelefonoPipe, TelefonoPipe, CampoFecha],
  template: `
    <!-- La cabecera del panel (TV7.1): el titular y una sola acción principal.
         La navegación entre días va debajo. -->
    <header class="cabecera-panel">
      <div>
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="titular text-4xl">Reservas del día</h1>
          <!-- La agenda se repuebla sola con los avisos del servidor. Decirlo evita
               que alguien recargue por las dudas cada dos minutos. -->
          <app-insignia variante="exito" icono="sensors">En vivo</app-insignia>
        </div>
        <p class="mt-1 text-muted-foreground">{{ enPalabras(fechaActual()) }}</p>
      </div>

      <button type="button" class="boton boton-primario" (click)="tomandoHora.set(true)">
        <span class="icono text-base" aria-hidden="true">add</span>
        Nueva reserva
      </button>
    </header>

    <div class="mt-4 flex flex-wrap items-end gap-3">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="boton boton-secundario boton-chico min-h-11"
          aria-label="Día anterior"
          (click)="moverDia(-1)"
        >
          <span class="icono text-base" aria-hidden="true">chevron_left</span>
        </button>
        <button
          type="button"
          class="boton boton-secundario boton-chico min-h-11"
          [disabled]="fechaActual() === hoy"
          (click)="fechaActual.set(hoy)"
        >
          Hoy
        </button>
        <button
          type="button"
          class="boton boton-secundario boton-chico min-h-11"
          aria-label="Día siguiente"
          (click)="moverDia(1)"
        >
          <span class="icono text-base" aria-hidden="true">chevron_right</span>
        </button>
      </div>

      <div>
        <label for="fecha" class="block text-sm font-medium">Ir a un día</label>
        <app-campo-fecha
          class="mt-1"
          inputId="fecha"
          claseCampo="min-h-11 w-36 cursor-pointer py-2"
          [valor]="fechaActual()"
          (valorChange)="cambiarFecha($event)"
        />
      </div>
    </div>

    @if (tomandoHora()) {
      <app-nueva-reserva
        [fecha]="fechaActual()"
        (cerrar)="tomandoHora.set(false)"
        (creada)="anunciarCreada($event)"
      />
    }

    @if (avisoDeCreacion(); as texto) {
      <app-aviso variante="exito" class="mt-4 block">{{ texto }}</app-aviso>
    }

    @if (reservas.hasValue() && reservas.value().length > 0) {
      <ul class="mt-6 grid gap-3 sm:grid-cols-3">
        @for (dato of resumenDelDia(); track dato.titulo) {
          <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <span class="icono text-primary" aria-hidden="true">{{ dato.icono }}</span>
              {{ dato.titulo }}
            </p>
            <p class="mt-1 font-display text-3xl font-bold">{{ dato.valor }}</p>
          </li>
        }
      </ul>
    }

    <div role="status" aria-live="polite" class="mt-6">
      @if (reservas.isLoading()) {
        <p class="text-muted-foreground">Buscando las reservas del día…</p>
      } @else if (reservas.error() || clases.error()) {
        <p class="text-destructive">
          No se pudo cargar la agenda. Reintenta en un momento.
        </p>
      } @else if (elDia().length === 0) {
        <!-- Sobre el día entero y no solo sobre las reservas: con una clase
             agendada, "no hay reservas" se leía justo encima de la clase. -->
        <app-estado-vacio
          icono="event_available"
          titulo="No hay nada agendado este día"
          detalle="Las reservas que entren aparecen acá solas, sin recargar."
        />
      } @else {
        <!-- Lo anuncia para quien no ve la tabla: es la misma región que cambia
             sola cuando entra una reserva nueva. -->
        <p class="sr-only">{{ resumen() }}</p>
      }
    </div>

    @if (elDia().length > 0) {
      <ul class="mt-4 space-y-3">
        <!-- Clases y reservas en la misma lista y en orden de reloj, que es como
             el mesón mira el día. La clase se distingue por la palabra "Clase" y su
             ícono, no por el color: criterio 7 del spec de clases. -->
        @for (fila of elDia(); track fila.clave) {
          @if (fila.clase; as clase) {
            <li class="rounded-xl border border-border bg-muted p-4 shadow-sm">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p class="font-display text-lg font-semibold">
                  {{ hora(clase.inicio) }}–{{ hora(clase.fin) }}
                </p>
                <p class="font-medium">{{ clase.cancha }}</p>
                <app-insignia variante="info" icono="school">
                  Clase · {{ nivel(clase.nivel) }}
                </app-insignia>
              </div>
              <p class="mt-1">
                {{ clase.profesor }}
                <span class="text-sm text-muted-foreground">
                  · hasta {{ clase.cupoMaximo }} alumnos
                </span>
              </p>
            </li>
          } @else if (fila.reserva; as reserva) {
          <li
            class="rounded-xl border border-border bg-card p-4 shadow-sm"
            [class.border-dashed]="reserva.estado === 'PENDIENTE_PAGO'"
          >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p class="font-display text-lg font-semibold">
                {{ hora(reserva.inicio) }}–{{ hora(reserva.fin) }}
              </p>
              <p class="font-medium">{{ reserva.cancha }}</p>
              <p class="text-sm text-muted-foreground">
                {{ reserva.esSocio ? 'Socio' : 'Visitante' }} · Folio
                {{ reserva.folio }}
              </p>
            </div>

            <p class="mt-1">
              {{ reserva.nombre }}
              @if (reserva.telefono) {
                <!-- Enlace y no texto suelto: en el teléfono del mesón se toca y
                     llama, que es exactamente para lo que está. -->
                <a class="underline" [href]="reserva.telefono | enlaceTelefono">
                  {{ reserva.telefono | telefono }}
                </a>
              }
            </p>

            @if (reserva.acompanantes.length > 0) {
              <p class="mt-1 text-sm text-muted-foreground">
                Con {{ reserva.acompanantes.join(', ') }}
              </p>
            }

            @if (reserva.estado === 'PENDIENTE_PAGO') {
              <!-- Insignia y borde punteado, no solo un color: ocupa la cancha
                   pero puede caerse, y esa diferencia hay que poder leerla. -->
              <p class="mt-2">
                <app-insignia variante="aviso">Esperando el pago</app-insignia>
              </p>
            }
          </li>
          }
        }
      </ul>
    }
  `,
})
export class AgendaDelDia {
  private readonly agenda = inject(Agenda);
  private readonly clasesApi = inject(Clases);

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
   * El día completo, en orden de reloj: lo que ocupa la cancha, sea lo que sea.
   *
   * Con `hasValue()` porque se lee también fuera de la rama del error, y cualquiera
   * de las dos consultas puede fallar sola.
   */
  protected readonly elDia = computed(() =>
    [
      ...(this.clases.hasValue() ? this.clases.value() : []).map((clase) => ({
        clave: `clase-${clase.id}`,
        inicio: clase.inicio,
        clase,
        reserva: null as ReservaDelDia | null,
      })),
      ...(this.reservas.hasValue() ? this.reservas.value() : []).map((reserva) => ({
        clave: `reserva-${reserva.id}`,
        inicio: reserva.inicio,
        clase: null as ClaseDelDia | null,
        reserva,
      })),
    ].sort((una, otra) => una.inicio.localeCompare(otra.inicio)),
  );

  protected nivel(clave: keyof typeof NIVELES): string {
    return NIVELES[clave] ?? clave;
  }

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
    const total = this.reservas.value().length;
    const clases = this.clases.value().length;
    const reservas = `${total} ${total === 1 ? 'reserva' : 'reservas'}`;

    // Las clases se nombran solo cuando las hay: "y 0 clases" es ruido en cada
    // anuncio para quien escucha la pantalla todo el día.
    return clases === 0
      ? `${reservas} este día.`
      : `${reservas} y ${clases} ${clases === 1 ? 'clase' : 'clases'} este día.`;
  };

  protected readonly hoy = hoyEnElClub();

  /** El formulario del mesón está abierto. */
  protected readonly tomandoHora = signal(false);
  protected readonly avisoDeCreacion = signal<string | null>(null);

  /**
   * La lista no se recarga acá a mano: la reserva nueva dispara el mismo aviso del
   * servidor que las que entran por la web, y la agenda ya se repuebla con eso.
   */
  protected anunciarCreada(folio: string): void {
    this.tomandoHora.set(false);
    this.avisoDeCreacion.set(`Hora tomada. Folio ${folio}.`);
  }

  /**
   * Las tres cuentas del día, sacadas de las reservas que ya llegaron.
   *
   * El diseño pide además ocupación e ingresos. Ninguno de los dos sale de este
   * endpoint —la agenda no trae montos ni el total de bloques del día—, y
   * calcularlos a ojo sería inventarle plata al club.
   */
  protected readonly resumenDelDia = computed(() => {
    const reservas = this.reservas.value();

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

  protected cambiarFecha(valor: string): void {
    if (valor) this.fechaActual.set(valor);
  }

  /**
   * Un día adelante o atrás.
   *
   * Se mueve desde el mediodía UTC por lo mismo que la tira de días de la
   * disponibilidad: los domingos del cambio de hora no tienen 24 horas.
   */
  protected moverDia(pasos: number): void {
    const dia = new Date(`${this.fechaActual()}T12:00:00.000Z`);
    dia.setUTCDate(dia.getUTCDate() + pasos);

    this.fechaActual.set(fechaEnElClub(dia));
  }

  protected readonly hora = horaEnElClub;
  protected readonly enPalabras = diaEnPalabras;
}
