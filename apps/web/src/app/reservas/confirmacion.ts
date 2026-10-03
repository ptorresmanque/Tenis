import { Component, computed, inject, resource, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
} from '../catalogo-canchas/reloj-del-club';
import { Club } from '../club/club.service';
import { Auth } from '../core/auth/auth';
import { Aviso } from '../ui/aviso';
import { Insignia } from '../ui/insignia';
import { enlaceDeReserva, qrDeReserva } from './qr';
import { ReservasPublicas } from './reserva-publica.service';

/** Los motivos que la API manda en la redirección, en castellano. */
const MOTIVOS: Record<string, string> = {
  anulado: 'Anulaste el pago en Webpay, así que la hora volvió a estar disponible.',
  token_desconocido:
    'No pudimos reconocer ese pago. Si te cobraron, escribe al club con la hora y el día.',
  sin_token: 'El pago no se completó y la hora volvió a estar disponible.',
  rechazada: 'El pago fue rechazado y la hora volvió a estar disponible.',
};

/**
 * Donde aterriza quien vuelve de la pasarela.
 *
 * Es una página y no un cartel dentro de la grilla porque Webpay devuelve el
 * navegador con una recarga completa: cualquier estado que hubiera en memoria ya no
 * está, y lo único que sobrevive es lo que viene en la URL.
 *
 * El resumen y el QR salen del **token** que viene en esa URL, no de la URL misma:
 * con él, el servidor devuelve la reserva de verdad. Sin token —una confirmación
 * vieja, o un pago que no se completó— la pantalla se queda con el folio, que es lo
 * único que puede afirmar sin inventar nada.
 */
@Component({
  selector: 'app-confirmacion-reserva',
  imports: [RouterLink, Aviso, Insignia],
  template: `
    <section class="mx-auto max-w-lg py-10">
      @if (folio() && !error()) {
        <div class="text-center">
          <p class="icono text-6xl text-accent-strong" aria-hidden="true">
            check_circle
          </p>
          <h1 class="mt-3 font-display text-3xl font-bold">Reserva confirmada</h1>
          <p class="mt-2 text-muted-foreground">
            Tu hora quedó tomada. Muestra este folio en el club.
          </p>
          <!-- El estado que devuelve el servidor, no un "Pagada" fijo: el socio
               no paga la hora y la del mesón se cobra en efectivo, así que la
               insignia afirmaba un pago que en dos de los tres casos no existió. -->
          <p class="mt-3">
            <app-insignia [variante]="esperandoElPago() ? 'aviso' : 'exito'">
              {{ esperandoElPago() ? 'Esperando el pago' : 'Confirmada' }}
            </app-insignia>
          </p>
        </div>

        <!-- El resumen y el QR llegan del token, no de la URL: lo único que viaja
             en la redirección de Webpay es el folio y ese token, y con el segundo
             el servidor devuelve la reserva de verdad. -->
        @if (detalle.error()) {
          <app-aviso variante="aviso" class="mt-8 block">
            No se pudo cargar el resumen ni el QR. Con el folio te atienden igual en el club.
          </app-aviso>
        } @else if (detalle.value(); as reserva) {
          <div class="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
            <dl class="grid gap-3 sm:grid-cols-2">
              <div>
                <dt class="text-sm text-muted-foreground">Cancha</dt>
                <dd class="font-semibold">{{ reserva.cancha }}</dd>
              </div>
              <div>
                <dt class="text-sm text-muted-foreground">Día</dt>
                <dd class="font-semibold">{{ dia(reserva.inicio) }}</dd>
              </div>
              <div>
                <dt class="text-sm text-muted-foreground">Horario</dt>
                <dd class="font-semibold">
                  {{ hora(reserva.inicio) }}–{{ hora(reserva.fin) }}
                  @if (reserva.esPico) {
                    · hora pico
                  }
                </dd>
              </div>
              <div>
                <dt class="text-sm text-muted-foreground">A nombre de</dt>
                <dd class="font-semibold">{{ reserva.nombre }}</dd>
              </div>
            </dl>
          </div>

          @if (qr(); as imagen) {
            <div
              class="mt-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm"
            >
              <h2 class="font-display text-lg font-semibold">Tu entrada a la cancha</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                Muéstralo en portería. Funciona sin conexión: guárdalo como foto.
              </p>
              <!-- El QR es decorativo para el lector de pantalla: lo que codifica
                   está escrito abajo como enlace, que es la versión que sí se puede
                   leer, copiar y compartir. -->
              <img [src]="imagen" alt="" class="mx-auto mt-4" width="240" height="240" />
              <p class="mt-2 text-xs break-all text-muted-foreground">
                <a [href]="enlace()" class="underline">{{ enlace() }}</a>
              </p>
            </div>
          }
        }

        <!-- El folio en azul pleno y en la escala de marcador: es el único dato
             que esta pantalla existe para entregar, y el que la persona va a
             dictar por teléfono o mostrar en el mesón. En una tarjeta blanca más
             pesaba lo mismo que el resumen de al lado. -->
        <div class="mt-8 rounded-region bg-campo p-6 text-center text-on-campo">
          <p class="text-sm font-medium text-on-campo/80">Folio</p>
          <p class="font-display text-marcador tracking-widest break-all">
            {{ folio() }}
          </p>

          <button
            type="button"
            class="boton boton-chico mt-4 bg-on-campo text-campo"
            (click)="copiar()"
          >
            <span class="icono text-base" aria-hidden="true">content_copy</span>
            Copiar el folio
          </button>

          <!-- Lo que pasó al copiar se dice, no se deja adivinar: el portapapeles
               no da ninguna señal visible por su cuenta. -->
          <p role="status" aria-live="polite" class="mt-2 text-sm text-accent-strong">
            {{ avisoDeCopia() }}
          </p>
        </div>

        <section class="mt-8" aria-labelledby="antes-de-venir">
          <h2 id="antes-de-venir" class="font-display text-xl font-semibold">
            Antes de venir
          </h2>
          <ul class="mt-3 grid gap-3">
            @for (dato of ANTES_DE_VENIR(); track dato.titulo) {
              <li class="flex gap-3 rounded-xl border border-border bg-card p-4">
                <span class="icono text-2xl text-primary" aria-hidden="true">
                  {{ dato.icono }}
                </span>
                <div>
                  <p class="font-semibold">{{ dato.titulo }}</p>
                  <p class="text-sm text-muted-foreground">{{ dato.detalle }}</p>
                </div>
              </li>
            }
          </ul>
        </section>

        <div class="mt-8 flex flex-wrap justify-center gap-3 print:hidden">
          <!-- Solo con ficha de socio: a quien reservó sin cuenta, "Mis reservas" le
               muestra una lista vacía. -->
          @if (esSocio()) {
            <a routerLink="/mis-reservas" class="boton boton-primario">
              Ver mis reservas
            </a>
          }
          <!-- El comprobante es esta misma página impresa, no un PDF armado aparte.
               El navegador ya sabe guardarla como PDF, y una plantilla paralela se
               desincroniza de lo que la persona tiene delante en cuanto cambie
               cualquiera de las dos. -->
          <button type="button" class="boton boton-secundario" (click)="imprimir()">
            <span class="icono text-base" aria-hidden="true">download</span>
            Descargar comprobante
          </button>
          <a routerLink="/disponibilidad" class="boton boton-secundario">
            Reservar otra hora
          </a>
        </div>

        <!-- Cancelar vive en "Mis reservas", que es donde el servidor ya dice
             hasta cuándo se puede y cuánto se devuelve. Esto lleva derecho a la
             confirmación de **esta** reserva en vez de repetir esas reglas acá,
             donde esta pantalla no tiene con qué calcularlas. Solo con sesión:
             quien reservó sin cuenta no tiene esa lista. -->
        @if (esSocio()) {
          <p class="mt-6 text-center">
            <a
              routerLink="/mis-reservas"
              [queryParams]="{ cancelar: folio() }"
              class="boton boton-texto text-destructive"
            >
              <span class="icono text-base" aria-hidden="true">cancel</span>
              Cancelar esta reserva
            </a>
          </p>
        }
      } @else {
        <div class="text-center">
          <h1 class="font-display text-3xl font-bold">La reserva no se completó</h1>
        </div>

        <app-aviso variante="error" class="mt-6 block">{{ explicacion() }}</app-aviso>

        <div class="mt-8 flex justify-center">
          <a routerLink="/disponibilidad" class="boton boton-primario">
            Volver a la disponibilidad
          </a>
        </div>
      }
    </section>
  `,
})
export class ConfirmacionReserva {
  private readonly parametros = toSignal(inject(ActivatedRoute).queryParamMap);

  private readonly auth = inject(Auth);

  protected readonly club = inject(Club).datos;

  /** Quien no tiene ficha de socio no tiene lista donde cancelar. */
  protected readonly esSocio = computed(
    () => this.auth.usuario()?.socioId != null,
  );

  protected readonly folio = computed(
    () => this.parametros()?.get('folio') ?? null,
  );

  /** La llave de la página pública, si la reserva quedó confirmada. */
  protected readonly token = computed(() => this.parametros()?.get('t') ?? null);

  private readonly publicas = inject(ReservasPublicas);

  protected readonly detalle = resource({
    params: () => ({ token: this.token() }),
    loader: ({ params }) =>
      params.token
        ? this.publicas.porToken(params.token)
        : Promise.resolve(undefined),
  });

  /**
   * Sin el detalle no se sabe si falta el pago, y se dice "Confirmada" como mientras
   * carga. `hasValue()` porque `value()` lanza si la consulta falló.
   */
  protected readonly esperandoElPago = computed(
    () => this.detalle.hasValue() && this.detalle.value().estado === 'PENDIENTE_PAGO',
  );

  protected readonly enlace = computed(() =>
    this.token() ? enlaceDeReserva(this.token()!) : '',
  );

  /**
   * El QR se dibuja en el navegador, no lo manda el servidor.
   *
   * Es una imagen de 240px hecha de un texto que ya está en la URL: pedírsela a la
   * API sería un viaje más para generar algo que el cliente tiene todo para armar.
   */
  private readonly imagenQr = resource({
    params: () => ({ enlace: this.enlace() }),
    loader: ({ params }) =>
      params.enlace ? qrDeReserva(params.enlace) : Promise.resolve(undefined),
  });

  protected readonly qr = computed(() => this.imagenQr.value());
  protected readonly error = computed(
    () => this.parametros()?.get('error') ?? null,
  );

  protected readonly avisoDeCopia = signal('');

  /**
   * Lo que el club repite en cada llamada. Nada que dependa de la configuración:
   * los plazos de cambio y devolución los resuelve el servidor reserva por
   * reserva, y escribirlos acá sería una segunda verdad que nadie actualiza.
   *
   * El último cambia según quién mira: **el socio cancela solo y el visitante sin
   * cuenta no**. El QR es de solo lectura por decisión, y quien reservó sin
   * registrarse no tiene "Mis reservas" donde entrar; mandarlo ahí sería pasearlo
   * por una pantalla vacía.
   */
  protected readonly ANTES_DE_VENIR = computed(() => [
    {
      icono: 'backpack',
      titulo: 'Qué traer',
      detalle:
        'Zapatillas de cancha dura y raqueta propia, o arriéndala en portería.',
    },
    {
      icono: 'timer',
      titulo: 'Llega 10 minutos antes',
      detalle: 'Anúnciate en recepción para entrar a la cancha a tiempo.',
    },
    this.esSocio()
      ? {
          icono: 'edit_calendar',
          titulo: 'Para cambiarla o cancelarla',
          detalle:
            'Entra a "Mis reservas": ahí dice hasta cuándo se puede y cuánto se devuelve.',
        }
      : {
          icono: 'call',
          titulo: 'Para cambiarla o cancelarla',
          detalle: this.club().email
            ? `Escribe a ${this.club().email} con tu folio, o llama al club. Sin ` +
              'cuenta no se puede hacer desde la web.'
            : 'Llama al club con tu folio: sin cuenta no se puede hacer desde la web.',
        },
  ]);

  protected readonly explicacion = computed(() => {
    const motivo = this.error();

    return (
      (motivo && MOTIVOS[motivo]) ??
      'El pago no se completó, así que la hora volvió a estar disponible.'
    );
  });

  protected readonly hora = horaEnElClub;

  /**
   * El comprobante: esta página, impresa.
   *
   * Lo que se lleva la persona es lo mismo que está viendo —resumen, folio y QR—,
   * sin una segunda plantilla que mantener ni una librería de PDF en el bundle. El
   * navegador ofrece "Guardar como PDF" en el mismo diálogo.
   */
  protected imprimir(): void {
    window.print();
  }

  protected dia(instante: string): string {
    return diaEnPalabras(fechaEnElClub(instante));
  }

  protected async copiar(): Promise<void> {
    const folio = this.folio();
    if (!folio) return;

    try {
      await navigator.clipboard.writeText(folio);
      this.avisoDeCopia.set('Folio copiado.');
    } catch {
      // Sin permiso o sin API: el folio está a la vista igual, así que el
      // fallo no bloquea nada. Lo que no se puede es quedarse en silencio.
      this.avisoDeCopia.set('No se pudo copiar. Anótalo o sácale una foto.');
    }
  }
}
