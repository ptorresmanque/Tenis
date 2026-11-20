import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  resource,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

import { PAGO_EN_PALABRAS } from '../../catalogo-canchas/marcador';
import {
  diaEnPalabras,
  enPesos,
  fechaEnElClub,
  horaEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { EnlaceTelefonoPipe, TelefonoPipe } from '../../core/telefono';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { dialogoSegun } from '../../ui/dialogo';
import { LO_HECHO } from '../../ui/material';
import { mensajeDeRechazo, ReservaCancelada, Reservas } from '../reservas.service';
import { Agenda, PagoWebpay, ReservaDelDia } from './agenda.service';
import { ObservacionesDeReserva } from './observaciones-de-reserva';

/**
 * La insignia del pago: la palabra, su ícono y su color (que no es lo único que lo dice). Los
 * íconos están en la fuente recortada del sitio (`iconos-en-uso.txt`, T369).
 */
const INSIGNIA_DEL_PAGO: Record<ReservaDelDia['pago'], { icono: string; variante: string }> = {
  SIN_COBRO: { icono: 'badge', variante: 'neutro' },
  ESPERANDO: { icono: 'schedule', variante: 'aviso' },
  EN_LINEA: { icono: 'check_circle', variante: 'exito' },
  EN_EL_MESON: { icono: 'payments', variante: 'neutro' },
};

/** El estado de un pago por Webpay, como lo dice el club. */
const ESTADO_DEL_PAGO: Record<PagoWebpay['estado'], string> = {
  PENDIENTE: 'Pendiente',
  AUTORIZADA: 'Autorizado',
  RECHAZADA: 'Rechazado',
  ANULADA: 'Devuelto',
  EXPIRADA: 'Expirado',
};

/**
 * La ficha de una reserva de la agenda (T271): lo que antes decía su tarjeta en la lista
 * —la hora, la cancha, de quién es, cómo llamarlo, con quién juega, cómo se paga— y las
 * observaciones del mesón (T226). El tablero dice de quién es cada hora; esto, todo lo demás.
 *
 * **Al admin, además** (T391, `SPEC-panel.md` § Reservas del panel): lo que dijo Webpay de cada
 * pago y «Cancelar reserva», con la confirmación dentro de la misma ficha y no en otro diálogo
 * encima. El gestor ve la ficha y anota, nada más: la API no le deja cancelar, y Finanzas no
 * es suya.
 *
 * Es todo un diálogo, como «Nueva reserva»: se abre al crearse y avisa al cerrarse.
 */
@Component({
  selector: 'app-ficha-de-la-reserva',
  imports: [
    Aviso,
    Esqueleto,
    MatButton,
    MatChipsModule,
    MatDialogModule,
    MatIcon,
    MatIconButton,
    EnlaceTelefonoPipe,
    ObservacionesDeReserva,
    RouterLink,
    TelefonoPipe,
  ],
  template: `
    <ng-template #dialogo>
      @let laReserva = reserva();
      <div class="flex items-start justify-between gap-2">
        <!-- min-w-0: sin esto, en el teléfono un título largo no bajaba de línea y sacaba de la
             vista el ícono para cerrar. -->
        @if (confirmando()) {
          <h2 mat-dialog-title class="min-w-0 flex-1">
            ¿Cancelar la reserva de {{ laReserva.nombre }}?
          </h2>
        } @else {
          <h2 mat-dialog-title class="min-w-0 flex-1">Reserva de {{ laReserva.nombre }}</h2>
        }
        <!-- «Cerrar» es un ícono con nombre: las acciones de abajo quedan para lo que se hace
             con la reserva, dos como máximo (lineamientos de Material, dialog). -->
        <button
          matIconButton
          type="button"
          mat-dialog-close
          class="m-2 shrink-0"
          aria-label="Cerrar la ficha"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </div>

      @if (confirmando()) {
        <mat-dialog-content>
          <p class="font-display text-lg font-semibold">
            {{ hora(laReserva.inicio) }}–{{ hora(laReserva.fin) }} · {{ laReserva.cancha }}
          </p>
          <!-- Los dos botones la nombran: el foco cae en «Volver», y sin esto el lector anunciaba
               solo el botón y no lo que pasa con la plata (revisión, T394). -->
          <p id="consecuencia-de-cancelar" class="mt-2">{{ consecuencia() }}</p>
          <p class="mt-1 text-sm text-muted-foreground">
            Si la reserva tiene correo, le avisamos.
          </p>
          @if (error(); as falla) {
            <!-- El rechazo de la API tal cual: ya viene escrito para una persona. -->
            <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
          }
        </mat-dialog-content>
        <!-- «Volver» queda donde estaba «Cancelar reserva»: un segundo clic en el mismo lugar no
             cancela sin leer (modern-web-guidance, dialog). Confirmar va al borde. -->
        <mat-dialog-actions align="end">
          <button
            #volver
            matButton
            type="button"
            aria-describedby="consecuencia-de-cancelar"
            (click)="volverALaFicha()"
          >
            Volver
          </button>
          <button
            matButton="filled"
            type="button"
            aria-describedby="consecuencia-de-cancelar"
            [disabled]="cancelando()"
            [attr.aria-busy]="cancelando()"
            (click)="confirmarCancelacion()"
          >
            {{ cancelando() ? 'Cancelando…' : 'Cancelar reserva' }}
          </button>
        </mat-dialog-actions>
      } @else {
        <mat-dialog-content>
          <p class="font-display text-lg font-semibold">
            {{ hora(laReserva.inicio) }}–{{ hora(laReserva.fin) }} · {{ laReserva.cancha }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{ laReserva.esSocio ? 'Socio' : 'Visitante' }} · Folio {{ laReserva.folio }}
          </p>

          <p class="mt-3">
            {{ laReserva.nombre }}
            @if (laReserva.telefono) {
              <!-- Enlace y no texto suelto: en el teléfono del mesón se toca y llama, que es
                   exactamente para lo que está. -->
              <a class="underline" [href]="laReserva.telefono | enlaceTelefono">
                {{ laReserva.telefono | telefono }}
              </a>
            }
          </p>

          @if (laReserva.acompanantes.length > 0) {
            <p class="mt-1 text-sm text-muted-foreground">
              Con {{ laReserva.acompanantes.join(', ') }}
            </p>
          }

          <!-- Cómo se paga, con palabras (RD1): la que espera el pago ocupa la cancha pero puede
               caerse. -->
          @let insignia = insignias[laReserva.pago];
          <mat-chip-set class="insignias mt-2">
            <mat-chip class="insignia" [class]="insignia.variante">
              <mat-icon matChipAvatar aria-hidden="true">{{ insignia.icono }}</mat-icon>
              {{ pagoEnPalabras[laReserva.pago] }}
            </mat-chip>
          </mat-chip-set>
          @if (enCurso()) {
            <!-- Por eso no hay acciones: la API las rechazaría con PAGO_EN_CURSO (revisión, T394). -->
            <p class="mt-2 text-sm text-muted-foreground">
              Tiene un pago en curso: si no se completa, la hora se libera sola en unos minutos.
            </p>
          }

          @if (esAdmin()) {
            <!-- Lo que dijo Webpay (RD2): solo acá, y solo al admin. Una lista de definiciones
                 por pago: la compra y, si la alargó, la diferencia. -->
            <section data-pagos class="mt-4" aria-labelledby="titulo-de-los-pagos">
              <h3
                id="titulo-de-los-pagos"
                class="font-display text-sm font-bold tracking-wide uppercase"
              >
                Pago
              </h3>
              @if (pagos.isLoading()) {
                <app-esqueleto [filas]="2" etiqueta="Buscando los pagos…" />
              } @else if (pagos.error()) {
                <p class="text-sm text-destructive">
                  No se pudieron cargar los pagos. Reintenta en un momento.
                </p>
              } @else {
                @for (pago of pagosSeguros(); track pago.id) {
                  <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt class="text-muted-foreground">Estado</dt>
                    <dd>{{ estadoDelPago[pago.estado] }}</dd>
                    <dt class="text-muted-foreground">Monto</dt>
                    <dd class="tabular-nums">{{ pesos(pago.montoClp) }}</dd>
                    <dt class="text-muted-foreground">Orden de compra</dt>
                    <dd class="break-all">{{ pago.referencia }}</dd>
                    <dt class="text-muted-foreground">Autorización</dt>
                    <dd>{{ pago.codigoAutorizacion ?? '—' }}</dd>
                    <dt class="text-muted-foreground">Tarjeta</dt>
                    <dd>{{ pago.ultimosDigitos ? 'terminada en ' + pago.ultimosDigitos : '—' }}</dd>
                    <dt class="text-muted-foreground">Iniciado</dt>
                    <dd>{{ cuando(pago.creadaEn) }}</dd>
                    <dt class="text-muted-foreground">Confirmado</dt>
                    <dd>{{ pago.confirmadaEn ? cuando(pago.confirmadaEn) : '—' }}</dd>
                    @if (pago.requiereRevision) {
                      <dt class="text-muted-foreground">Revisión</dt>
                      <dd class="font-semibold">Requiere revisión</dd>
                    }
                  </dl>
                  <!-- Ahí se revisa y se devuelve (T399): abre su ficha, con el día en que se pagó
                       en la lista de atrás. -->
                  <a
                    class="mt-1 inline-block text-sm underline"
                    routerLink="/administracion/finanzas/pagos"
                    [queryParams]="enFinanzas(pago)"
                  >
                    Ver en Finanzas › Pagos
                  </a>
                } @empty {
                  <p class="text-sm text-muted-foreground">
                    {{
                      laReserva.esSocio
                        ? 'Socio: la hora no se cobra.'
                        : 'Sin pagos en línea: se cobra en el mesón.'
                    }}
                  </p>
                }
              }
            </section>
          }

          <!-- Las notas del mesón (T226): las ven el admin y el gestor, nunca el socio. -->
          <app-observaciones-de-reserva [reserva]="laReserva" (cambio)="cambio.emit()" />
        </mat-dialog-content>

        @if (esAdmin() && !yaTermino() && !enCurso()) {
          <!-- «Cancelar reserva» a la izquierda: en la confirmación, ese lugar es de «Volver».
               «Modificar» al borde, la acción principal de la ficha (T392). -->
          <mat-dialog-actions align="end">
            <button #cancelarReserva matButton type="button" (click)="pedirConfirmacion()">
              Cancelar reserva
            </button>
            <!-- La otra acción llena es confirmar la cancelación, en la otra rama del mismo if: se
                 ve una a la vez.
                 mat-guidelines-ignore: multiples-filled -->
            <button matButton="filled" type="button" (click)="modificar.emit(laReserva)">
              Modificar
            </button>
          </mat-dialog-actions>
        }
      }
    </ng-template>
  `,
})
export class FichaDeLaReserva {
  readonly reserva = input.required<ReservaDelDia>();
  /** El admin ve el pago y cancela; el gestor, no (T391). */
  readonly esAdmin = input(false);

  /** Se cerró: con Escape, el fondo o el ícono. */
  readonly cerrar = output<void>();
  /** Se anotó, corrigió o borró una observación: el día se vuelve a pedir. */
  readonly cambio = output<void>();
  /** Se canceló: la agenda la cierra y vuelve a pedir el día. El aviso ya lo puso la ficha. */
  readonly cancelada = output<ReservaCancelada>();
  /** «Modificar»: la agenda la cierra y pone el tablero en modo mover (T392). */
  readonly modificar = output<ReservaDelDia>();

  private readonly agenda = inject(Agenda);
  private readonly reservasApi = inject(Reservas);
  private readonly snackBar = inject(MatSnackBar);
  private readonly injector = inject(Injector);

  private readonly dialogo = viewChild.required<TemplateRef<unknown>>('dialogo');
  private readonly volver = viewChild('volver', { read: ElementRef<HTMLButtonElement> });
  private readonly cancelarReserva = viewChild('cancelarReserva', {
    read: ElementRef<HTMLButtonElement>,
  });

  /**
   * Por el id y no por la reserva: cada recarga del día trae un objeto nuevo, y volver a pedir los
   * pagos ponía el esqueleto en la ficha en plena confirmación (revisión, T394).
   */
  private readonly idDeLaReserva = computed(() => this.reserva().id);

  /** Lo que dijo Webpay: solo se pide para el admin, que es el único que lo ve. */
  protected readonly pagos = resource({
    params: () => (this.esAdmin() ? { id: this.idDeLaReserva() } : undefined),
    loader: ({ params }) => this.agenda.pagosDe(params.id),
  });
  protected readonly pagosSeguros = computed(() =>
    this.pagos.hasValue() ? this.pagos.value().pagos : [],
  );

  protected readonly confirmando = signal(false);
  protected readonly cancelando = signal(false);
  protected readonly error = signal<string | null>(null);

  /**
   * Lo que pasa al cancelar, dicho antes de confirmar: al socio se le libera el cupo; al
   * visitante que pagó en línea, se le devuelve o no según el plazo del club, que la API ya
   * calculó (`devolucionAlCancelar`).
   */
  protected readonly consecuencia = computed(() => {
    if (this.reserva().esSocio) {
      // Lo mismo que le dice el correo: no es solo el cupo del día, también el prime y el de invitados.
      return 'Esa hora deja de contar en sus cupos: puede reservar otra.';
    }

    // Sin los pagos a la vista no se afirma que no los hay: la devolución la decide la API igual.
    if (this.pagos.error()) {
      return 'No se pudieron cargar los pagos: si pagó en línea, se devuelve según el plazo del club.';
    }
    if (!this.pagos.hasValue()) return 'Buscando los pagos…';

    const datos = this.pagos.value();
    const autorizados = datos.pagos.filter(({ estado }) => estado === 'AUTORIZADA');
    if (autorizados.length === 0) {
      return 'No tiene pagos en línea: si pagó en el mesón, la devolución se resuelve ahí.';
    }

    const total = autorizados.reduce((suma, { montoClp }) => suma + montoClp, 0);
    return datos.devolucionAlCancelar
      ? `Se le devuelve todo lo pagado, ${enPesos(total)}, al mismo medio de pago.`
      : 'Ya pasó el plazo de devolución: el pago no se devuelve.';
  });

  constructor() {
    dialogoSegun(
      () => true,
      this.dialogo,
      () => this.cerrar.emit(),
      {
        width: '32rem',
        maxWidth: '92vw',
        // A la parada del tablero y no al botón que la abrió: si la reserva se canceló, ese botón
        // ya no está y el foco se iba al body (WCAG 2.4.3; revisión, T394). Si sigue, es el mismo:
        // la parada es la última celda que tuvo el foco.
        restoreFocus: 'app-marcador tbody [tabindex="0"]',
      },
    );
  }

  /** Webpay todavía no responde: mover o cancelar, la API lo rechaza con `PAGO_EN_CURSO`. */
  protected readonly enCurso = computed(() => this.reserva().pago === 'ESPERANDO');

  /** La que ya se jugó no se cancela (R8): la API la rechazaría con `YA_TERMINO`. */
  protected yaTermino(): boolean {
    return new Date(this.reserva().fin).getTime() <= Date.now();
  }

  /** El foco va a «Volver», lo seguro en una confirmación destructiva. */
  protected pedirConfirmacion(): void {
    this.error.set(null);
    this.confirmando.set(true);
    afterNextRender(() => this.volver()?.nativeElement.focus(), { injector: this.injector });
  }

  /** De vuelta a la ficha, el foco vuelve al botón que abrió la confirmación. */
  protected volverALaFicha(): void {
    this.error.set(null);
    this.confirmando.set(false);
    afterNextRender(() => this.cancelarReserva()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected async confirmarCancelacion(): Promise<void> {
    if (this.cancelando()) return;
    this.cancelando.set(true);
    this.error.set(null);

    try {
      const { folio, huboDevolucion, motivo } = await this.reservasApi.cancelar(this.reserva().id);
      // El aviso lo pone la ficha y no la agenda: el servidor avisa en vivo antes de responder,
      // la agenda vuelve a pedir el día y esta ficha puede irse antes de que llegue la respuesta.
      // El snackbar es de la aplicación, y sale igual (lo encontró la prueba en el navegador).
      this.snackBar.open(
        `Reserva ${folio} cancelada.${huboDevolucion ? ' Se devolvió el pago.' : ''}`,
        undefined,
        LO_HECHO,
      );
      this.cancelada.emit({ folio, huboDevolucion, motivo });
    } catch (falla) {
      this.error.set(mensajeDeRechazo(falla).mensaje);
    } finally {
      this.cancelando.set(false);
    }
  }

  /** La ficha del pago en Finanzas › Pagos, con la lista en el día en que se movió la plata. */
  protected enFinanzas({ id, confirmadaEn, creadaEn }: PagoWebpay): Record<string, string> {
    const dia = fechaEnElClub(confirmadaEn ?? creadaEn);
    return { pago: `webpay-${id}`, desde: dia, hasta: dia };
  }

  /** «lunes, 10 de agosto, 11:00», en la hora del club. */
  protected cuando(instante: string): string {
    return `${diaEnPalabras(fechaEnElClub(instante))}, ${horaEnElClub(instante)}`;
  }

  protected readonly hora = horaEnElClub;
  protected readonly pesos = enPesos;
  protected readonly insignias = INSIGNIA_DEL_PAGO;
  protected readonly pagoEnPalabras = PAGO_EN_PALABRAS;
  protected readonly estadoDelPago = ESTADO_DEL_PAGO;
}
