import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { enPesos } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { PagoPendiente, Torneos } from '../torneos.service';

/**
 * Los pagos de inscripción que esperan que alguien los mire.
 *
 * **Rechazar libera el cupo**, así que no es un botón cualquiera: la inscripción sale
 * del cuadro y su lugar queda para el primero de la lista de espera. Por eso pide un
 * motivo escrito — es lo que el club le va a decir por teléfono a esa persona.
 *
 * El comprobante se abre en otra pestaña y **solo lo sirve el servidor a un admin**:
 * lleva el nombre, el banco y el número de cuenta de alguien.
 */
@Component({
  selector: 'app-pagos-pendientes',
  imports: [FormsModule, Aviso, EstadoVacio, Insignia],
  template: `
    <h1 class="font-display text-3xl font-bold">Pagos de inscripción</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Quien se inscribió y dice que pagó. Hasta que confirmes,
      <strong>ocupa cupo pero no entra al cuadro</strong>: el club no arma un cuadro con
      un pago sin revisar.
    </p>

    @if (pendientes.isLoading()) {
      <p class="mt-6 text-muted-foreground">Cargando…</p>
    } @else if (pendientes.value().length === 0) {
      <app-estado-vacio
        class="mt-6 block"
        icono="task_alt"
        titulo="No hay nada esperando"
        detalle="Cuando alguien se inscriba a un torneo con costo, aparece acá."
      />
    } @else {
      <ul class="mt-6 grid gap-3">
        @for (pago of pendientes.value(); track pago.id) {
          <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div class="flex flex-wrap items-center gap-3">
              <span class="font-medium">{{ pago.jugador }}</span>
              <app-insignia variante="info" icono="emoji_events">
                {{ pago.torneo }} · {{ pago.categoria }}
              </app-insignia>
              <span class="font-mono">{{ enPesos(pago.montoClp) }}</span>

              @if (pago.tieneComprobante) {
                <!-- En otra pestaña y no embebido: es una imagen que el admin mira
                     una vez, y traerla a esta pantalla la cargaría para todos los de
                     la lista. -->
                <a
                  class="boton boton-secundario boton-chico"
                  [href]="'/api/admin/inscripciones/' + pago.id + '/comprobante'"
                  target="_blank"
                  rel="noopener"
                >
                  Ver comprobante
                </a>
              } @else {
                <app-insignia variante="aviso" icono="hourglass_empty">
                  Sin comprobante todavía
                </app-insignia>
              }
            </div>

            @if (pago.telefono) {
              <p class="mt-1 text-sm text-muted-foreground">
                <!-- El teléfono va acá a propósito: es a quien hay que llamar si el
                     comprobante no cuadra, y no tenerlo obliga a abrir otra pantalla. -->
                Para llamarlo: {{ pago.telefono }}
              </p>
            }

            <div class="mt-3 flex flex-wrap items-end gap-2">
              <button
                type="button"
                class="boton boton-primario boton-chico"
                [disabled]="trabajando()"
                (click)="aprobar(pago)"
              >
                Confirmar el pago
              </button>

              <label class="min-w-64 flex-1 text-sm">
                <span class="text-muted-foreground">Motivo del rechazo</span>
                <input
                  class="campo mt-1"
                  [attr.name]="'motivo-' + pago.id"
                  maxlength="200"
                  placeholder="El comprobante es de otro monto"
                  [(ngModel)]="motivos[pago.id]"
                />
              </label>

              <button
                type="button"
                class="boton boton-secundario boton-chico border-destructive
                       text-destructive"
                [disabled]="trabajando()"
                (click)="rechazar(pago)"
              >
                Rechazar
              </button>
            </div>

            <p class="mt-1 text-sm text-muted-foreground">
              Rechazar <strong>lo saca del cuadro</strong> y libera su cupo para el
              primero de la lista de espera.
            </p>

            <!-- **Junto a la fila y no al pie de la página.** Con ocho pendientes, un
                 aviso al final queda fuera de pantalla y el admin cree que su clic no
                 hizo nada. -->
            @if (resuelto() === pago.id && error(); as falla) {
              <app-aviso variante="error" class="mt-2 block">{{ falla }}</app-aviso>
            }
          </li>
        }
      </ul>
    }

    @if (aviso(); as texto) {
      <app-aviso variante="exito" class="mt-4 block">{{ texto }}</app-aviso>
    } @else if (resuelto() === null && error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }
  `,
})
export class PagosPendientes {
  private readonly api = inject(Torneos);

  /** El del resto del sitio: una sola forma de escribir un monto. */
  protected readonly enPesos = enPesos;

  protected readonly motivos: Record<number, string> = {};

  /** De qué fila es el error que se está mostrando, para ponerlo al lado. */
  protected readonly resuelto = signal<number | null>(null);

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly pendientes = resource({
    params: () => this.version(),
    loader: () => this.api.pagosPendientes(),
    defaultValue: [] as PagoPendiente[],
  });

  protected async aprobar(pago: PagoPendiente): Promise<void> {
    this.resuelto.set(pago.id);
    await this.intentar(
      () => this.api.aprobarPago(pago.id),
      `${pago.jugador} queda con su inscripción pagada.`,
    );
  }

  protected async rechazar(pago: PagoPendiente): Promise<void> {
    const motivo = (this.motivos[pago.id] ?? '').trim();

    // **El motivo se exige acá además de en el servidor.** No es validación duplicada
    // por gusto: es lo que el club le va a decir por teléfono a alguien a quien acaba
    // de dejar fuera del torneo, y mandarlo vacío para que el servidor lo rechace le
    // haría perder el clic.
    if (motivo.length < 3) {
      this.resuelto.set(pago.id);
      this.aviso.set(null);
      this.error.set('Escribe por qué lo rechazas antes de hacerlo.');
      return;
    }

    this.resuelto.set(pago.id);
    await this.intentar(
      () => this.api.rechazarPago(pago.id, motivo),
      `${pago.jugador} sale del cuadro y su cupo queda libre.`,
    );
  }

  private async intentar(
    accion: () => Promise<unknown>,
    hecho: string,
  ): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.aviso.set(hecho);
    } catch (falla) {
      // El del servidor tal cual: dice si alguien la resolvió antes que tú, que es el
      // caso de dos admins mirando la misma bandeja.
      this.error.set(mensajeDelServidor(falla, 'No se pudo resolver el pago.'));
    } finally {
      this.trabajando.set(false);
      this.version.update((veces) => veces + 1);
    }
  }
}
