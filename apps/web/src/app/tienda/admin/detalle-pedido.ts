import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { enPesos } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { TelefonoPipe } from '../../core/telefono';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { Insignia } from '../../ui/insignia';
import { ESTADOS, FECHA } from '../estados-del-pedido';
import { AccionDePedido, DetalleDePedido, PedidosDeLaTiendaAdmin } from './pedidos.service';

const MEDIOS = {
  WEBPAY: 'Webpay',
  TARJETA_MESON: 'Tarjeta en el mesón',
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
};

/**
 * El detalle de un pedido en el panel (T169): quién compró, cómo lo recibe, qué documento
 * lleva y qué compró, y **solo las acciones de su estado** —listo para retirar,
 * despachado con el número de Starken, entregado—. La API las vuelve a revisar y responde
 * 409 si el pedido cambió entre medio; el mensaje se muestra tal cual.
 */
@Component({
  selector: 'app-detalle-de-pedido',
  imports: [FormsModule, RouterLink, Aviso, Esqueleto, Insignia, TelefonoPipe],
  template: `
    <p>
      <a
        routerLink="/administracion/tienda/pedidos"
        class="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4
               hover:underline"
      >
        <span class="icono text-lg" aria-hidden="true">arrow_back</span>
        Volver a los pedidos
      </a>
    </p>

    @if (pedido.isLoading() && !pedido.hasValue()) {
      <app-esqueleto class="mt-4 block" [filas]="6" etiqueta="Cargando el pedido…" />
    } @else if (pedido.error()) {
      <p class="mt-4 text-destructive">No se pudo cargar el pedido. Reintenta en un momento.</p>
    } @else if (pedido.value(); as p) {
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <h2 class="rotulo-seccion">Pedido N.º {{ p.id }}</h2>
        <app-insignia [variante]="ESTADOS[p.estado].variante">{{
          ESTADOS[p.estado].texto
        }}</app-insignia>
        @if (p.requiereRevision) {
          <app-insignia variante="error" icono="report">Requiere revisión</app-insignia>
        }
      </div>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ p.canal === 'MESON' ? 'Venta en el mesón' : 'Compra en línea' }} del
        {{ fecha(p.creadoEn) }} · {{ MEDIOS[p.medioPago] }}
      </p>

      @if (hecho(); as mensaje) {
        <app-aviso class="mt-4 block" variante="exito">{{ mensaje }}</app-aviso>
      }
      @if (error(); as falla) {
        <app-aviso class="mt-4 block" variante="error">{{ falla }}</app-aviso>
      }

      @if (p.estado === 'PAGADO' && p.entrega === 'RETIRO') {
        <div class="mt-4">
          <button
            type="button"
            class="boton boton-primario"
            [disabled]="procesando()"
            [attr.aria-busy]="procesando()"
            (click)="aplicar(p, 'listo')"
          >
            Marcar listo para retirar
          </button>
        </div>
      } @else if (p.estado === 'PAGADO' && p.entrega === 'DESPACHO') {
        <div class="mt-4 flex flex-wrap items-end gap-3">
          <div class="grid gap-1 text-sm">
            <label for="seguimiento" class="font-medium">Número de seguimiento de Starken</label>
            <input
              id="seguimiento"
              name="numeroSeguimiento"
              class="campo"
              maxlength="60"
              [(ngModel)]="seguimiento"
            />
          </div>
          <button
            type="button"
            class="boton boton-primario"
            [disabled]="procesando() || !seguimiento.trim()"
            [attr.aria-busy]="procesando()"
            (click)="aplicar(p, 'despachado')"
          >
            Marcar despachado
          </button>
        </div>
      } @else if (p.estado === 'LISTO_PARA_RETIRO' || p.estado === 'DESPACHADO') {
        <div class="mt-4">
          <button
            type="button"
            class="boton boton-primario"
            [disabled]="procesando()"
            [attr.aria-busy]="procesando()"
            (click)="aplicar(p, 'entregado')"
          >
            Marcar entregado
          </button>
        </div>
      }

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section
          class="rounded-xl border border-border bg-card p-5"
          aria-labelledby="titulo-cliente"
        >
          <h3 id="titulo-cliente" class="subtitulo">Cliente</h3>
          <p class="mt-2 font-semibold">{{ p.nombre || 'Sin nombre' }}</p>
          @if (p.email) {
            <p>
              <a [href]="'mailto:' + p.email" class="underline">{{ p.email }}</a>
            </p>
          }
          @if (p.telefono) {
            <p>{{ p.telefono | telefono }}</p>
          }
        </section>

        <section
          class="rounded-xl border border-border bg-card p-5"
          aria-labelledby="titulo-entrega-panel"
        >
          <h3 id="titulo-entrega-panel" class="subtitulo">Entrega</h3>
          @if (p.entrega === 'DESPACHO') {
            <p class="mt-2">Despacho a {{ donde() }}</p>
            @if (p.referencia) {
              <p class="text-sm text-muted-foreground">{{ p.referencia }}</p>
            }
            @if (p.numeroSeguimiento) {
              <p class="mt-1">
                Starken: <strong class="font-mono">{{ p.numeroSeguimiento }}</strong>
              </p>
            }
          } @else if (p.entrega === 'RETIRO') {
            <p class="mt-2">Retiro en el club</p>
          } @else {
            <p class="mt-2">Entregado en el mesón</p>
          }
          <h3 class="subtitulo mt-4">Documento</h3>
          @switch (p.documento) {
            @case ('VOUCHER') {
              <p class="mt-2">Comprobante de Webpay: vale como boleta.</p>
            }
            @case ('BOLETA') {
              <p class="mt-2">
                Boleta {{ p.folioDocumento ? 'N.º ' + p.folioDocumento : 'por emitir' }}
              </p>
            }
            @case ('FACTURA') {
              <p class="mt-2">
                Factura {{ p.folioDocumento ? 'N.º ' + p.folioDocumento : 'por emitir' }} a
                {{ p.facturaRazonSocial }}, RUT {{ p.facturaRut }}
              </p>
              <p class="text-sm text-muted-foreground">
                Giro: {{ p.facturaGiro }} · {{ p.facturaDireccion }}
              </p>
            }
          }
        </section>
      </div>

      <section
        class="mt-6 rounded-xl border border-border bg-card p-5"
        aria-labelledby="titulo-lineas"
      >
        <h3 id="titulo-lineas" class="subtitulo">Lo que compró</h3>
        <ul class="mt-2 divide-y divide-border">
          @for (linea of p.lineas; track linea.id) {
            <li class="flex justify-between gap-3 py-2">
              <span>
                {{ linea.cantidad }} × {{ linea.descripcion }}
                @if (linea.esEncargo) {
                  <app-insignia variante="info" icono="local_shipping">Encargo</app-insignia>
                }
              </span>
              <span class="whitespace-nowrap">{{
                pesos((linea.precioUnitarioClp - linea.descuentoUnitarioClp) * linea.cantidad)
              }}</span>
            </li>
          }
        </ul>
        <dl class="mt-2 grid grid-cols-2 gap-y-1 border-t border-border pt-2">
          @if (p.descuentoSocioClp > 0) {
            <dt class="text-sm text-primary">Descuento de socio</dt>
            <dd class="text-right text-sm text-primary">−{{ pesos(p.descuentoSocioClp) }}</dd>
          }
          <dt class="font-bold">Total</dt>
          <dd class="text-right font-display text-xl font-bold">{{ pesos(p.totalClp) }}</dd>
        </dl>
      </section>
    }
  `,
})
export class DetalleDePedidoPanel {
  private readonly api = inject(PedidosDeLaTiendaAdmin);

  /** Llega de la URL, `/administracion/tienda/pedidos/:id`. */
  readonly id = input.required<string>();

  protected readonly ESTADOS = ESTADOS;
  protected readonly MEDIOS = MEDIOS;
  protected readonly pesos = enPesos;

  protected readonly pedido = resource({
    params: () => Number(this.id()),
    loader: ({ params }) => this.api.detalle(params),
  });

  protected readonly donde = computed(() => {
    const p = this.pedido.hasValue() ? this.pedido.value() : null;

    return [p?.direccion, p?.comuna, p?.region].filter(Boolean).join(', ');
  });

  protected seguimiento = '';
  protected readonly procesando = signal(false);
  protected readonly hecho = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async aplicar(pedido: DetalleDePedido, accion: AccionDePedido): Promise<void> {
    this.procesando.set(true);
    this.hecho.set(null);
    this.error.set(null);

    try {
      await this.api.accion(
        pedido.id,
        accion,
        accion === 'despachado' ? { numeroSeguimiento: this.seguimiento.trim() } : {},
      );
      this.hecho.set(
        accion === 'entregado'
          ? 'Quedó marcado como entregado.'
          : pedido.email
            ? `Listo. Le avisamos a ${pedido.email} por correo.`
            : 'Listo. El pedido no tiene correo, así que avísale por otra vía.',
      );
      this.pedido.reload();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo cambiar el pedido.', [400, 409]));
    } finally {
      this.procesando.set(false);
    }
  }

  protected fecha(iso: string): string {
    return FECHA.format(new Date(iso));
  }
}
