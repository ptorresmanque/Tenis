import { Component, computed, effect, inject, input, resource, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { Aviso } from '../ui/aviso';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { Insignia } from '../ui/insignia';
import { Carrito } from './carrito';
import { ESTADOS, FECHA } from './estados-del-pedido';
import { PedidoPublico, Tienda } from './tienda.service';

/**
 * El pedido, `/tienda/pedido/:token` (T166): **la confirmación y el seguimiento son la
 * misma página**. La abre la vuelta de Webpay —con `?pago=listo`— y la abre el enlace del
 * correo. Sin sesión: el token lo conoce quien compró, como el de una reserva.
 *
 * Pagado, le avisa al carrito, que se vacía solo si este pedido salió de él y una vez
 * (`Carrito.pagado`): abierto más tarde desde el correo, no borra otra compra en camino.
 */
@Component({
  selector: 'app-pagina-del-pedido',
  imports: [RouterLink, Aviso, Esqueleto, EstadoVacio, Insignia],
  template: `
    @if (pedido.isLoading()) {
      <app-esqueleto [filas]="5" etiqueta="Cargando el pedido…" />
    } @else if (pedido.error()) {
      <p class="text-destructive">No se pudo cargar el pedido. Reintenta en un momento.</p>
    } @else if (pedido.value(); as p) {
      <!-- Por pagadoEn y no por el ?pago=listo: con un monto que no cuadra, pagos deja la
           transacción en revisión y el pedido sigue sin pagar. -->
      @if (pago() === 'listo' && p.pagadoEn) {
        <app-aviso class="mb-6 block" variante="exito" titulo="Pago recibido">
          Gracias por tu compra. Te mandamos el detalle a {{ p.email }}.
        </app-aviso>
      }

      <div class="flex flex-wrap items-center gap-3">
        <h1 class="titular text-4xl sm:text-5xl">Pedido N.º {{ p.id }}</h1>
        <app-insignia [variante]="estado().variante">{{ estado().texto }}</app-insignia>
      </div>
      <p class="mt-1 text-muted-foreground">
        Del {{ fecha(p.creadoEn) }}, a nombre de {{ p.nombre }}.
      </p>

      @if (p.estado === 'EXPIRADO') {
        <app-aviso class="mt-4 block" variante="aviso">
          Este pedido no se pagó, así que no se reservó nada. Tu carrito sigue en este navegador.
          <a routerLink="/tienda/carrito" class="font-semibold underline">Volver al carrito</a>
        </app-aviso>
      }

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <section
          class="rounded-xl border border-border bg-card p-5 lg:col-span-2"
          aria-labelledby="titulo-lo-comprado"
        >
          <h2
            id="titulo-lo-comprado"
            class="font-display text-lg font-bold tracking-wider uppercase"
          >
            Lo que compraste
          </h2>
          <ul class="mt-3 divide-y divide-border">
            @for (linea of p.lineas; track $index) {
              <li class="flex justify-between gap-3 py-2">
                <span class="min-w-0">{{ linea.cantidad }} × {{ linea.descripcion }}</span>
                <span class="whitespace-nowrap">{{ subtotal(linea) }}</span>
              </li>
            }
          </ul>
          <dl class="mt-3 grid grid-cols-2 gap-y-1 border-t border-border pt-3">
            @if (p.descuentoSocioClp > 0) {
              <dt class="text-sm text-primary">Descuento de socio</dt>
              <dd class="text-right text-sm text-primary">−{{ pesos(p.descuentoSocioClp) }}</dd>
            }
            <dt class="font-bold">Total</dt>
            <dd class="text-right font-display text-2xl font-bold">{{ pesos(p.totalClp) }}</dd>
          </dl>
        </section>

        <section
          class="h-fit rounded-xl border border-border bg-card p-5"
          aria-labelledby="titulo-entrega"
        >
          <h2 id="titulo-entrega" class="font-display text-lg font-bold tracking-wider uppercase">
            Entrega
          </h2>
          @if (p.entrega === 'DESPACHO') {
            <p class="mt-2">
              Despacho a {{ donde() }}{{ p.referencia ? ' (' + p.referencia + ')' : '' }}.
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              Es por pagar: lo pagas a Starken al recibirlo.
            </p>
            @if (p.numeroSeguimiento) {
              <p class="mt-2">
                Número de seguimiento de Starken:
                <strong class="font-mono">{{ p.numeroSeguimiento }}</strong>
              </p>
            }
          } @else {
            <p class="mt-2">Retiro en el club.</p>
            <p class="mt-1 text-sm text-muted-foreground">
              Te avisamos por correo cuando esté listo para retirar.
            </p>
          }
          <p class="mt-4 text-sm text-muted-foreground">
            @if (p.documento === 'FACTURA') {
              Factura a nombre de {{ p.facturaRazonSocial }}.
            } @else {
              El comprobante de Webpay vale como boleta.
            }
          </p>
        </section>
      </div>
    } @else {
      <app-estado-vacio
        icono="receipt_long"
        titulo="No encontramos ese pedido"
        detalle="Revisa que el enlace sea el del correo de tu compra."
      />
      <p class="mt-4 text-center">
        <a routerLink="/tienda" class="boton boton-primario">Ver la tienda</a>
      </p>
    }
  `,
})
export class PaginaDelPedido {
  private readonly tienda = inject(Tienda);
  private readonly carrito = inject(Carrito);

  /** Llegan de la URL, con `withComponentInputBinding`. */
  readonly token = input.required<string>();
  readonly pago = input<string>();

  protected readonly pesos = enPesos;

  protected readonly pedido = resource({
    params: () => this.token(),
    loader: ({ params }) => this.tienda.pedido(params),
  });

  private readonly actual = computed(() => (this.pedido.hasValue() ? this.pedido.value() : null));

  protected readonly estado = computed(() => ESTADOS[this.actual()?.estado ?? 'PENDIENTE_PAGO']);

  protected readonly donde = computed(() => {
    const p = this.actual();

    return [p?.direccion, p?.comuna, p?.region].filter(Boolean).join(', ');
  });

  constructor() {
    effect(() => {
      const pedido = this.actual();
      if (pedido?.pagadoEn) untracked(() => this.carrito.pagado(pedido.token));
    });
  }

  protected subtotal(linea: PedidoPublico['lineas'][number]): string {
    return enPesos((linea.precioUnitarioClp - linea.descuentoUnitarioClp) * linea.cantidad);
  }

  protected fecha(iso: string): string {
    return FECHA.format(new Date(iso));
  }
}
