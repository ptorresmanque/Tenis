import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  diaEnPalabras,
  enPesos,
  fechaEnElClub,
  horaEnElClub,
  minutosDe,
} from '../catalogo-canchas/reloj-del-club';
import { Club } from '../club/club.service';
import { Aviso } from '../ui/aviso';
import { Insignia, VarianteInsignia } from '../ui/insignia';
import { ReservasPublicas } from './reserva-publica.service';

const ESTADOS: Record<string, { texto: string; variante: VarianteInsignia; icono: string }> =
  {
    CONFIRMADA: { texto: 'Confirmada', variante: 'exito', icono: 'check_circle' },
    PENDIENTE_PAGO: {
      texto: 'Esperando el pago',
      variante: 'aviso',
      icono: 'schedule',
    },
    CANCELADA: { texto: 'Cancelada', variante: 'error', icono: 'cancel' },
    EXPIRADA: { texto: 'Expirada', variante: 'error', icono: 'timer_off' },
  };

/**
 * La reserva vista desde el QR, en el mesón.
 *
 * **Está pensada para leerse de un vistazo y a un metro de distancia**: quien la
 * mira tiene a alguien enfrente esperando entrar a la cancha. Por eso el estado va
 * primero y grande, y lo demás abajo.
 *
 * No pide sesión: el teléfono del mesón no tiene cuenta, y quien reservó sin cuenta
 * tampoco. El token de la URL es lo único que hace de llave, y por eso la respuesta
 * del servidor no trae ni el teléfono ni el correo del titular.
 */
@Component({
  selector: 'app-reserva-publica',
  imports: [Aviso, Insignia, RouterLink],
  template: `
    <section class="mx-auto max-w-md py-10">
      @if (reserva.isLoading()) {
        <p class="text-center text-muted-foreground">Buscando la reserva…</p>
      } @else if (reserva.error()) {
        <app-aviso variante="error" titulo="Este enlace no lleva a ninguna reserva">
          Puede estar mal copiado o pertenecer a una reserva que ya no existe.
          Búscala por su folio en la agenda del día.
        </app-aviso>
      } @else if (reserva.value(); as datos) {
        @if (resultadoDelCambio(); as resultado) {
          <!-- Lo que pasó con el cambio, al volver de Webpay o de la grilla (T91). Arriba
               de la tarjeta: es lo primero que la persona quiere saber, y la tarjeta de
               abajo ya muestra la hora como quedó, con el mismo folio. -->
          <app-aviso [variante]="resultado.variante" class="mb-4 block">
            {{ resultado.texto }}
          </app-aviso>
        }

        <!-- La misma forma que "Mis reservas" (TV5.3): la tarjeta sin borde, el
             nombre como titular y la hora en su rótulo. -->
        <div class="bg-card p-6 text-center shadow-md">
          <p>
            <app-insignia [variante]="estado().variante" [icono]="estado().icono">
              {{ estado().texto }}
            </app-insignia>
          </p>

          <h1 class="titular mt-4 text-4xl">{{ datos.nombre }}</h1>
          <p class="mt-1 font-display text-lg font-bold tracking-wide uppercase">
            {{ datos.cancha }}
          </p>

          <p
            class="rotulo-hora mt-4 inline-flex px-3 py-1 text-4xl"
            [class.rotulo-hora-pico]="datos.esPico"
          >
            {{ hora(datos.inicio) }}–{{ hora(datos.fin) }}
          </p>
          <p class="text-muted-foreground">{{ dia(datos.inicio) }}</p>

          <dl class="mt-6 grid grid-cols-2 gap-3 text-start text-sm">
            <div class="bg-muted p-3">
              <dt class="text-muted-foreground">Folio</dt>
              <dd class="font-mono font-semibold">{{ datos.folio }}</dd>
            </div>
            <div class="bg-muted p-3">
              <dt class="text-muted-foreground">Entran</dt>
              <dd class="font-semibold">{{ cuantosEntran() }}</dd>
            </div>
          </dl>

          @if (datos.esPico) {
            <p class="mt-3">
              <app-insignia variante="aviso" icono="trending_up">Hora pico</app-insignia>
            </p>
          }
        </div>

        @if (datos.estado !== 'CONFIRMADA') {
          <app-aviso variante="aviso" class="mt-4 block">
            Esta hora no está confirmada: no corresponde dar acceso a la cancha sin
            revisarla en la agenda del día.
          </app-aviso>
        }

        @if (datos.sePuedeCambiar) {
          <!-- Cambiar sí, desde T88: el visitante no tiene cuenta, y esta página es su
               "mis reservas". La regla de la plata se dice acá, antes del clic. -->
          <div class="mt-6 text-center">
            <a
              routerLink="/disponibilidad"
              [queryParams]="{
                moverToken: token(),
                fecha: fechaDelClub(datos.inicio),
                duracion: duracionDeLaGrilla(),
              }"
              class="boton boton-primario"
            >
              <span class="icono text-base" aria-hidden="true">schedule</span>
              Cambiar hora o duración
            </a>
            <p class="mt-2 text-sm text-muted-foreground">
              Si la nueva vale menos de lo que pagaste, no se devuelve la diferencia.
            </p>
          </div>
        }

        <!-- Esta página **no cancela**, por decisión: el enlace se reenvía y queda
             en pantallas ajenas, y con poder de cancelación perderlo de vista sería
             perder la hora. Lo que sí corresponde es decir por dónde se cancela, en
             vez de dejar a alguien buscando un botón que no existe. -->
        <p class="mt-4 text-center text-sm text-muted-foreground">
          ¿Hay que cancelar esta hora?
          @if (club().email) {
            Escribe a
            <a
              [href]="'mailto:' + club().email"
              class="underline hover:text-primary"
            >
              {{ club().email }}
            </a>
            o dile
          } @else {
            Dile
          }
          al club en el mesón: desde este enlace no se puede.
        </p>
      }
    </section>
  `,
})
export class ReservaPublicaPagina {
  /** Llega de la URL: `/r/:token`, con `withComponentInputBinding`. */
  readonly token = input.required<string>();
  /** Lo que pasó con el cambio (T91): `?cambio=hecho`, `hora_tomada`, `anulado`… */
  readonly cambio = input<string>();
  /** Lo devuelto si la hora se tomó mientras se pagaba; "0" es que quedó en revisión. */
  readonly devuelto = input<string>();

  private readonly api = inject(ReservasPublicas);

  protected readonly club = inject(Club).datos;

  protected readonly reserva = resource({
    params: () => ({ token: this.token() }),
    loader: ({ params }) => this.api.porToken(params.token),
  });

  protected readonly estado = computed(
    () =>
      ESTADOS[this.reserva.value()?.estado ?? ''] ?? {
        texto: 'Sin estado',
        variante: 'neutro' as VarianteInsignia,
        icono: 'help',
      },
  );

  /** El titular más sus acompañantes: el número que portería cuenta en la puerta. */
  protected readonly cuantosEntran = computed(() => {
    const cuantos = (this.reserva.value()?.acompanantes ?? 0) + 1;

    return cuantos === 1 ? '1 persona' : `${cuantos} personas`;
  });

  /** La grilla de mover busca horas de la misma duración (T87). Nulo: 1 hora. */
  protected readonly duracionDeLaGrilla = computed(() => {
    const datos = this.reserva.value();

    return datos && minutosDe(datos) === 90 ? 90 : null;
  });

  /**
   * El aviso del resultado. "Hecho" dice la hora como quedó, que es la de la tarjeta; lo
   * demás dice que la reserva sigue igual, que es lo que más importa saber.
   */
  protected readonly resultadoDelCambio = computed(() => {
    const datos = this.reserva.value();
    const cambio = this.cambio();

    if (!datos || !cambio) return null;

    if (cambio === 'hecho') {
      return {
        variante: 'exito' as const,
        texto: `Listo: tu reserva quedó de ${this.hora(datos.inicio)} a ${this.hora(datos.fin)}.`,
      };
    }

    if (cambio === 'hora_tomada') {
      const devuelto = Number(this.devuelto());

      return {
        variante: 'aviso' as const,
        texto:
          devuelto > 0
            ? `Esa hora se tomó mientras pagabas: te devolvimos ${enPesos(devuelto)} y tu ` +
              'reserva sigue igual.'
            : 'Esa hora se tomó mientras pagabas, y tu reserva sigue igual. La devolución de ' +
              'la diferencia quedó en revisión con el club.',
      };
    }

    // El monto que volvió no cuadra: Webpay cobró, el cambio no se aplicó y el club lo
    // revisa. Decir "no se completó" sería negar un cobro que la persona ve en su banco.
    if (cambio === 'en_revision') {
      return {
        variante: 'aviso' as const,
        texto: 'Recibimos tu pago, pero quedó en revisión con el club: tu reserva sigue igual.',
      };
    }

    if (cambio === 'anulado') {
      return {
        variante: 'info' as const,
        texto:
          'Anulaste el pago: tu reserva sigue igual. Si quieres intentarlo de nuevo, espera ' +
          'unos minutos.',
      };
    }

    return {
      variante: 'aviso' as const,
      texto: 'El pago no se completó: tu reserva sigue igual.',
    };
  });

  protected readonly hora = horaEnElClub;
  /** Para el enlace de cambiar: la grilla abre en el día de la reserva y no en hoy. */
  protected readonly fechaDelClub = fechaEnElClub;

  protected dia(instante: string): string {
    return diaEnPalabras(fechaEnElClub(instante));
  }
}
