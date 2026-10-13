import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { enPesos } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { FECHA } from '../estados-del-pedido';
import type { EstadoPedido } from '../tienda.service';
import { DetalleDePedido, MedioDevolucion, PedidosDeLaTiendaAdmin } from './pedidos.service';

/** El ancho de `devolucion.motivo` y de `pedido.motivo_cancelacion`. */
const LARGO_DEL_MOTIVO = 500;

/** Lo pagado que todavía está en el club se cancela (`SPEC-tienda.md` § Cancelaciones). */
const CANCELABLES: EstadoPedido[] = ['PAGADO', 'LISTO_PARA_RETIRO'];
/** Todo lo que se pagó se puede devolver, entregado o no. */
const PAGADOS: EstadoPedido[] = [...CANCELABLES, 'DESPACHADO', 'ENTREGADO'];

const MEDIOS: Record<MedioDevolucion, string> = {
  WEBPAY: 'Anulado en Webpay',
  TRANSFERENCIA: 'Transferencia',
  EFECTIVO: 'Efectivo',
};

/**
 * Cancelar y devolver, en el detalle del pedido (T174).
 *
 * **Cancelar** anula el pago en Webpay por el total. Si Webpay no deja —pasaron los 90
 * días—, la API responde 502 y recién entonces aparece "Cancelar y devolver por
 * transferencia": no se reintenta en silencio (`SPEC-tienda.md` § Cancelaciones).
 * **Devolver** una parte elige las unidades, y el monto se topa con lo pagado por ellas;
 * la API lo vuelve a revisar.
 *
 * Con una devolución registrada ya no se ofrece cancelar: lo devuelto saldría dos veces.
 */
@Component({
  selector: 'app-devoluciones-del-pedido',
  imports: [FormsModule, Aviso],
  template: `
    @if (pedido().devoluciones.length > 0) {
      <section
        class="mt-6 rounded-xl border border-border bg-card p-5"
        aria-labelledby="titulo-devoluciones"
      >
        <h3 id="titulo-devoluciones" class="subtitulo">Devoluciones</h3>
        <ul class="mt-2 divide-y divide-border">
          @for (devolucion of pedido().devoluciones; track devolucion.id) {
            <li class="py-2">
              <p class="flex justify-between gap-3">
                <span>
                  {{ fecha(devolucion.creadaEn) }} · {{ MEDIOS[devolucion.medio] }}
                  @if (!devolucion.reponeStock) {
                    <span class="text-muted-foreground">· no volvió a la venta</span>
                  }
                </span>
                <strong class="whitespace-nowrap">{{ pesos(devolucion.montoClp) }}</strong>
              </p>
              <p class="text-sm text-muted-foreground">{{ devolucion.motivo }}</p>
            </li>
          }
        </ul>
      </section>
    }

    @if (hecho(); as mensaje) {
      <app-aviso class="mt-4 block" variante="exito">{{ mensaje }}</app-aviso>
    }
    @if (error(); as falla) {
      <app-aviso class="mt-4 block" variante="error">{{ falla }}</app-aviso>
    }

    @if (sePuedeCancelar()) {
      <details class="mt-6 rounded-xl border border-border bg-card p-5">
        <summary class="cursor-pointer font-semibold">Cancelar el pedido</summary>
        <form class="mt-3 grid max-w-xl gap-3" (ngSubmit)="cancelar('WEBPAY')">
          <p class="text-sm text-muted-foreground">
            Se anula el pago en Webpay por el total, {{ pesos(pedido().totalClp) }}. Lo comprado
            vuelve al stock y le avisamos al comprador.
          </p>
          <label class="grid gap-1 text-sm">
            <span class="font-medium">Motivo *</span>
            <textarea
              class="campo"
              name="motivoCancelacion"
              rows="2"
              [maxlength]="LARGO_DEL_MOTIVO"
              placeholder="Lo pidió el comprador, el proveedor no cumplió el encargo"
              [(ngModel)]="motivoCancelacion"
            ></textarea>
          </label>
          <div class="flex flex-wrap gap-3">
            <button
              type="submit"
              class="boton boton-destructivo"
              [disabled]="procesando()"
              [attr.aria-busy]="procesando()"
            >
              Cancelar y anular en Webpay
            </button>
            @if (webpayNoDejo()) {
              <button
                type="button"
                class="boton boton-secundario"
                [disabled]="procesando()"
                [attr.aria-busy]="procesando()"
                (click)="cancelar('TRANSFERENCIA')"
              >
                Cancelar y devolver por transferencia
              </button>
            }
          </div>
        </form>
      </details>
    }

    @if (porDevolver().length > 0) {
      <details class="mt-4 rounded-xl border border-border bg-card p-5">
        <summary class="cursor-pointer font-semibold">Registrar una devolución</summary>
        <form class="mt-3 grid max-w-xl gap-4" (ngSubmit)="devolver()">
          <p class="text-sm text-muted-foreground">
            Un retracto, una garantía o una parte del pedido. La plata vuelve por transferencia o en
            efectivo.
          </p>
          <fieldset class="grid gap-2">
            <legend class="mb-1 text-sm font-medium">Unidades que se devuelven</legend>
            @for (linea of porDevolver(); track linea.id) {
              <label class="flex items-center gap-3 text-sm">
                <input
                  class="campo w-20"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  [max]="linea.quedan"
                  [name]="'unidades-' + linea.id"
                  [attr.name]="'unidades-' + linea.id"
                  [(ngModel)]="unidades[linea.id]"
                />
                <span>
                  {{ linea.descripcion }}
                  <span class="text-muted-foreground">(quedan {{ linea.quedan }})</span>
                </span>
              </label>
            }
          </fieldset>
          <label class="grid gap-1 text-sm">
            <span class="font-medium">Monto que se devuelve *</span>
            <input
              class="campo max-w-40"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              name="montoDevolucion"
              [(ngModel)]="monto"
            />
            <span class="text-muted-foreground">
              Hasta {{ pesos(hasta()) }}: lo que se pagó por esas unidades.
            </span>
          </label>
          <fieldset class="grid gap-2 text-sm">
            <legend class="mb-1 font-medium">Cómo se devuelve</legend>
            <label class="flex items-center gap-2">
              <input
                type="radio"
                name="medioDevolucion"
                value="TRANSFERENCIA"
                [(ngModel)]="medio"
              />
              Transferencia
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" name="medioDevolucion" value="EFECTIVO" [(ngModel)]="medio" />
              Efectivo
            </label>
          </fieldset>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" name="reponeStock" [(ngModel)]="reponeStock" />
            Vuelve a la venta. Desmárcalo si viene fallado.
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium">Motivo *</span>
            <textarea
              class="campo"
              name="motivoDevolucion"
              rows="2"
              [maxlength]="LARGO_DEL_MOTIVO"
              placeholder="Retracto, garantía: el marco llegó trizado"
              [(ngModel)]="motivoDevolucion"
            ></textarea>
          </label>
          <div>
            <button
              type="submit"
              class="boton boton-secundario"
              [disabled]="procesando()"
              [attr.aria-busy]="procesando()"
            >
              Registrar la devolución
            </button>
          </div>
        </form>
      </details>
    }
  `,
})
export class DevolucionesDelPedido {
  private readonly api = inject(PedidosDeLaTiendaAdmin);

  readonly pedido = input.required<DetalleDePedido>();
  /** Para que el detalle vuelva a pedir el pedido: cambió su estado o sus devoluciones. */
  readonly cambio = output<void>();

  protected readonly MEDIOS = MEDIOS;
  protected readonly LARGO_DEL_MOTIVO = LARGO_DEL_MOTIVO;
  protected readonly pesos = enPesos;

  protected readonly sePuedeCancelar = computed(() => {
    const p = this.pedido();

    return p.canal === 'EN_LINEA' && CANCELABLES.includes(p.estado) && p.devoluciones.length === 0;
  });

  /** Las líneas con unidades que todavía se pueden devolver. */
  protected readonly porDevolver = computed(() => {
    const p = this.pedido();
    if (!PAGADOS.includes(p.estado)) return [];

    return p.lineas
      .map((l) => ({ ...l, quedan: l.cantidad - l.cantidadDevuelta }))
      .filter((l) => l.quedan > 0);
  });

  protected motivoCancelacion = '';
  protected unidades: Record<number, number | null> = {};
  protected monto: number | null = null;
  protected medio: 'TRANSFERENCIA' | 'EFECTIVO' = 'TRANSFERENCIA';
  protected reponeStock = true;
  protected motivoDevolucion = '';

  protected readonly procesando = signal(false);
  protected readonly hecho = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  /** Webpay respondió que no: recién ahí se ofrece la transferencia. */
  protected readonly webpayNoDejo = signal(false);

  /** Lo pagado por las unidades elegidas: el tope del monto. */
  protected hasta(): number {
    return this.elegidas().reduce((suma, { lineaId, cantidad }) => {
      const linea = this.pedido().lineas.find((l) => l.id === lineaId)!;

      return suma + (linea.precioUnitarioClp - linea.descuentoUnitarioClp) * cantidad;
    }, 0);
  }

  protected async cancelar(medio: 'WEBPAY' | 'TRANSFERENCIA'): Promise<void> {
    const motivo = this.motivoCancelacion.trim();
    if (!motivo) {
      this.mostrarError('Escribe el motivo de la cancelación.');
      return;
    }

    await this.enviar('No se pudo cancelar el pedido.', async () => {
      await this.api.cancelar(this.pedido().id, { motivo, medio });
      this.motivoCancelacion = '';
      this.webpayNoDejo.set(false);

      return 'Pedido cancelado.';
    });
  }

  protected async devolver(): Promise<void> {
    const lineas = this.elegidas();
    const motivo = this.motivoDevolucion.trim();

    if (lineas.length === 0) {
      this.mostrarError('Elige qué unidades se devuelven.');
      return;
    }
    if (this.monto === null || !Number.isInteger(this.monto) || this.monto < 1) {
      this.mostrarError('Escribe el monto que se devuelve, en pesos.');
      return;
    }
    if (!motivo) {
      this.mostrarError('Escribe el motivo de la devolución.');
      return;
    }

    const cuerpo = {
      lineas,
      montoClp: this.monto,
      medio: this.medio,
      reponeStock: this.reponeStock,
      motivo,
    };
    await this.enviar('No se pudo registrar la devolución.', async () => {
      await this.api.devolver(this.pedido().id, cuerpo);
      this.unidades = {};
      this.monto = null;
      this.motivoDevolucion = '';

      return 'Devolución registrada.';
    });
  }

  /** Las unidades elegidas, enteras y mayores que cero. */
  private elegidas(): { lineaId: number; cantidad: number }[] {
    return Object.entries(this.unidades)
      .map(([id, cantidad]) => ({ lineaId: Number(id), cantidad: Number(cantidad) }))
      .filter(({ cantidad }) => Number.isInteger(cantidad) && cantidad > 0);
  }

  private async enviar(porDefecto: string, hacer: () => Promise<string>): Promise<void> {
    this.procesando.set(true);
    this.hecho.set(null);
    this.error.set(null);

    try {
      const listo = await hacer();
      const { email } = this.pedido();
      this.hecho.set(
        `${listo} ${
          email
            ? `Le avisamos a ${email} por correo.`
            : 'El pedido no tiene correo, así que avísale por otra vía.'
        }`,
      );
      this.cambio.emit();
    } catch (falla) {
      this.webpayNoDejo.set((falla as { status?: number }).status === 502);
      this.error.set(mensajeDelServidor(falla, porDefecto, [400, 409, 502]));
    } finally {
      this.procesando.set(false);
    }
  }

  private mostrarError(mensaje: string): void {
    this.hecho.set(null);
    this.error.set(mensaje);
  }

  protected fecha(iso: string): string {
    return FECHA.format(new Date(iso));
  }
}
