import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

import {
  diaEnPalabras,
  enPesos,
  fechaEnElClub,
  horaEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { irAPagar } from '../../core/pagos/ir-a-pagar';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Torneos } from '../torneos.service';

/**
 * La oferta de un cupo de la lista de espera: `/torneos/inscripcion/:token` (T334, SPEC-torneos.md
 * § Lista de espera sin cobro, LE4).
 *
 * Es a donde lleva el correo «Se abrió un cupo». Dice hasta cuándo se le guarda el cupo, y se toma
 * como cualquier inscripción: con Webpay o con el comprobante de una transferencia, o con un botón
 * si la categoría es gratis. **Lo que se puede hacer lo decide el servidor** (`situacion`): la
 * página no compara relojes, y si la oferta vence mientras se lee, el servidor responde 409 y la
 * página vuelve a leerla.
 *
 * Anular en Webpay o un pago rechazado vuelven acá con `?pago=`, porque el cupo le sigue guardado;
 * pagada, la vuelta de Webpay lleva a Torneos con su aviso, como la inscripción.
 */
@Component({
  selector: 'app-oferta-de-cupo',
  imports: [Aviso, Esqueleto, EstadoVacio, MatButton, MatIcon, RouterLink],
  template: `
    <a matButton routerLink="/torneos" class="mt-6">
      <mat-icon aria-hidden="true">arrow_back</mat-icon>
      Torneos
    </a>

    @if (oferta.error()) {
      <app-estado-vacio
        class="mt-6 block"
        icono="link_off"
        titulo="No encontramos esta inscripción"
        detalle="Revisa que el enlace sea el del correo, completo. Si el problema sigue, llámanos."
      >
        <!-- Un solo botón lleno a la vista: cada rama muestra el suyo, y nunca dos a la vez.
             mat-guidelines-ignore: multiples-filled -->
        <a matButton="filled" routerLink="/torneos">Ver los torneos</a>
      </app-estado-vacio>
    } @else if (oferta.value(); as cupo) {
      <header class="mt-4">
        <p class="font-display text-sm font-bold tracking-wider text-muted-foreground uppercase">
          Lista de espera
        </p>
        <h1 class="titular mt-1 text-5xl sm:text-6xl">{{ cupo.torneo }}</h1>
        <p class="mt-2 max-w-prose text-muted-foreground">
          {{ cupo.categoria }} · {{ cupo.montoClp > 0 ? enPesos(cupo.montoClp) : 'gratis' }}
        </p>
      </header>

      @switch (cupo.situacion) {
        @case ('OFRECIDO') {
          @if (vuelta(); as aviso) {
            <app-aviso variante="aviso" class="mt-4 block max-w-3xl">{{ aviso }}</app-aviso>
          }

          <section class="mt-6 max-w-3xl bg-card p-5 shadow-md" aria-labelledby="cupo-titulo">
            <h2 id="cupo-titulo" class="font-display text-lg font-bold tracking-wide uppercase">
              Se abrió un cupo para ti
            </h2>
            <p class="mt-1 max-w-prose">
              Te lo guardamos hasta el <strong>{{ hasta() }}</strong>. Si no lo tomas a tiempo,
              pasa al siguiente de la lista de espera.
            </p>

            @if (cupo.montoClp > 0) {
              <div class="mt-4 flex flex-wrap items-center gap-3">
                <button
                  matButton="filled"
                  type="button"
                  [disabled]="ocupado()"
                  [attr.aria-busy]="ocupado()"
                  (click)="pagar()"
                >
                  Pagar {{ enPesos(cupo.montoClp) }} con Webpay
                </button>
                <!-- matButton no va en una etiqueta: el botón abre el selector del campo escondido. -->
                <button
                  matButton="outlined"
                  type="button"
                  [disabled]="ocupado()"
                  (click)="comprobante.click()"
                >
                  Adjuntar comprobante de transferencia
                </button>
                <input
                  #comprobante
                  hidden
                  type="file"
                  accept="image/jpeg,image/png"
                  (change)="adjuntar($event)"
                />
              </div>
              <p class="mt-2 max-w-prose text-sm text-muted-foreground">
                Si transfieres, sube la imagen y el club la revisa. Hasta que la confirme, tu
                inscripción queda pendiente.
              </p>
            } @else {
              <div class="mt-4">
                <button
                  matButton="filled"
                  type="button"
                  [disabled]="ocupado()"
                  [attr.aria-busy]="ocupado()"
                  (click)="tomar()"
                >
                  Tomar el cupo
                </button>
              </div>
            }

            @if (error(); as falla) {
              <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
            }
          </section>
        }
        @case ('VENCIDO') {
          <app-estado-vacio
            class="mt-6 block"
            icono="timer_off"
            titulo="Se venció tu plazo"
            detalle="El cupo pasó al siguiente de la lista de espera. Si todavía quieres jugar, inscríbete de nuevo: quedas al final de la fila."
          >
            <a matButton="filled" routerLink="/torneos">Ver los torneos</a>
          </app-estado-vacio>
        }
        @case ('CERRADO') {
          <app-estado-vacio
            class="mt-6 block"
            icono="event_busy"
            titulo="La inscripción de esta categoría se cerró"
            detalle="El club armó el cuadro o cerró la inscripción antes de que tomaras el cupo. Llámanos si quieres saber más."
          >
            <a matButton="filled" routerLink="/torneos">Ver los torneos</a>
          </app-estado-vacio>
        }
        @case ('ESPERANDO') {
          <app-estado-vacio
            class="mt-6 block"
            icono="hourglass_empty"
            titulo="Sigues en la lista de espera"
            detalle="No se cobra nada mientras esperas. Si se abre un cupo, te avisamos por correo."
          >
            <a matButton="filled" routerLink="/torneos">Ver los torneos</a>
          </app-estado-vacio>
        }
        @case ('INSCRITO') {
          <app-estado-vacio
            class="mt-6 block"
            icono="check_circle"
            titulo="Ya estás inscrito"
            [detalle]="'Tu lugar en ' + cupo.categoria + ' está tomado. Nos vemos en la cancha.'"
          >
            <a matButton="filled" routerLink="/torneos">Ver los torneos</a>
          </app-estado-vacio>
        }
        @case ('RETIRADO') {
          <app-estado-vacio
            class="mt-6 block"
            icono="person_off"
            titulo="Esta inscripción ya no está en el torneo"
            detalle="Llámanos si hay un error."
          >
            <a matButton="filled" routerLink="/torneos">Ver los torneos</a>
          </app-estado-vacio>
        }
      }
    } @else if (oferta.isLoading()) {
      <app-esqueleto class="mt-6 block" [filas]="3" etiqueta="Cargando tu inscripción…" />
    }
  `,
})
export class OfertaDeCupo {
  /** La llave de la inscripción, del `:token` de la ruta (`withComponentInputBinding`). */
  readonly token = input.required<string>();
  /** `?pago=anulado` o `?pago=rechazado`: volvió de Webpay sin pagar. */
  readonly pago = input<string>();

  private readonly api = inject(Torneos);
  private readonly router = inject(Router);

  protected readonly enPesos = enPesos;

  protected readonly oferta = resource({
    params: () => this.token(),
    loader: ({ params }) => this.api.inscripcionPorLlave(params),
  });

  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  /** "viernes, 16 de octubre, a las 10:30", en el reloj del club. */
  protected readonly hasta = computed(() => {
    const hasta = this.oferta.value()?.hasta;

    return hasta ? `${diaEnPalabras(fechaEnElClub(hasta))}, a las ${horaEnElClub(hasta)}` : '';
  });

  /** Lo que se le dice a quien volvió de Webpay sin pagar: que el cupo le sigue guardado. */
  protected readonly vuelta = computed(() => {
    const sigue = `tu cupo sigue guardado hasta el ${this.hasta()}, y puedes intentarlo de nuevo.`;

    switch (this.pago()) {
      case 'anulado':
        return `No terminaste el pago: ${sigue}`;
      case 'rechazado':
        return `El pago fue rechazado: ${sigue}`;
      default:
        return null;
    }
  });

  /** A Webpay, por POST, como la inscripción: ver `irAPagar`. */
  protected async pagar(): Promise<void> {
    await this.hacer(async () => irAPagar(await this.api.pagarInscripcion(this.token())), false);
  }

  protected async adjuntar(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;

    await this.hacer(async () => {
      await this.api.subirComprobante(this.token(), archivo);
      this.terminarEnTorneos('comprobante');
    });
  }

  protected async tomar(): Promise<void> {
    await this.hacer(async () => {
      await this.api.tomarCupo(this.token());
      this.terminarEnTorneos('inscrito');
    });
  }

  /**
   * Hace lo que se pidió y, si el servidor lo rechaza, lo dice y vuelve a leer la oferta: puede
   * haber vencido, o haberse cerrado la categoría, mientras la persona leía.
   *
   * `soltar` en falso para Webpay: la página se va a la pasarela, y volver a habilitar el botón
   * dejaría apretarlo dos veces mientras sale.
   */
  private async hacer(accion: () => Promise<void>, soltar = true): Promise<void> {
    this.error.set(null);
    this.ocupado.set(true);

    try {
      await accion();
      if (soltar) this.ocupado.set(false);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo tomar el cupo. Intenta de nuevo.'));
      this.ocupado.set(false);
      this.oferta.reload();
    }
  }

  /** En Torneos, con el aviso de cómo quedó, como la inscripción (T323). Sin volver acá con «atrás». */
  private terminarEnTorneos(pago: 'comprobante' | 'inscrito'): void {
    void this.router.navigate(['/torneos'], { queryParams: { pago }, replaceUrl: true });
  }
}
