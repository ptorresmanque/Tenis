import { Component, inject, linkedSignal, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { Auth } from '../core/auth/auth';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { Carrito, Cotizacion } from './carrito';

/**
 * El carrito, `/tienda/carrito` (T163).
 *
 * **Todo lo que muestra sale de cotizar**: del navegador viene qué y cuánto, y la API pone
 * el precio, el descuento de socio, lo disponible y el total. Se vuelve a cotizar cada vez
 * que cambia el carrito o quien mira, así que quien inicia sesión ve su precio de socio
 * sin recargar.
 *
 * **No deja seguir con algo que no se puede comprar**: una línea que ya no se vende o que
 * pide más de lo que queda lo dice ahí mismo, y "Ir a pagar" espera a que se arregle. Hasta
 * que existan las pantallas de pago (T166), "Ir a pagar" queda apagado y dice que llega
 * pronto.
 */
@Component({
  selector: 'app-pagina-del-carrito',
  imports: [RouterLink, Esqueleto, EstadoVacio],
  template: `
    <p>
      <a
        routerLink="/tienda"
        class="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4
               hover:underline"
      >
        <span class="icono text-lg" aria-hidden="true">arrow_back</span>
        Seguir comprando
      </a>
    </p>
    <h1 class="mt-4 titular text-5xl sm:text-6xl">Tu carrito</h1>

    @if (carrito.lineas().length === 0) {
      <app-estado-vacio
        class="mt-6 block"
        icono="shopping_cart"
        titulo="Tu carrito está vacío"
        detalle="Elige algo en la tienda y aparecerá aquí."
      />
      <p class="mt-4 text-center">
        <a routerLink="/tienda" class="boton boton-primario">Ver la tienda</a>
      </p>
    } @else if (cotizacion.error()) {
      <p class="mt-6 text-destructive">No se pudo cargar el carrito. Reintenta en un momento.</p>
    } @else if (ultima(); as cotizada) {
      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <ul
          aria-label="Productos del carrito"
          class="divide-y divide-border rounded-xl border border-border bg-card lg:col-span-2"
        >
          @for (linea of cotizada.lineas; track linea.varianteId) {
            <li data-linea class="flex gap-3 p-4">
              @if (linea.producto?.foto; as foto) {
                <img
                  [src]="foto"
                  alt=""
                  width="80"
                  height="80"
                  class="size-16 shrink-0 rounded-lg object-cover sm:size-20"
                />
              } @else {
                <span
                  class="icono grid size-16 shrink-0 place-items-center rounded-lg bg-muted
                         text-muted-foreground sm:size-20"
                  aria-hidden="true"
                  >image</span
                >
              }

              <div class="min-w-0 flex-1">
                @if (linea.producto; as producto) {
                  <a
                    [routerLink]="['/tienda', producto.id]"
                    class="font-semibold underline-offset-4 hover:underline"
                    >{{ producto.nombre }}</a
                  >
                  <p class="text-sm text-muted-foreground">
                    {{ producto.marca ? producto.marca + ' · ' : '' }}{{ linea.talla }}
                  </p>
                } @else {
                  <p class="font-semibold">Un producto que ya no está a la venta</p>
                }

                @if (linea.precioUnitarioClp !== null) {
                  <p class="mt-1 text-sm">
                    {{ pesos(linea.precioUnitarioClp - linea.descuentoUnitarioClp) }} c/u
                    @if (linea.descuentoUnitarioClp > 0) {
                      <span class="text-muted-foreground line-through">{{
                        pesos(linea.precioUnitarioClp)
                      }}</span>
                    }
                  </p>
                }

                @if (linea.estado === 'no-disponible' && linea.producto) {
                  <p class="mt-1 text-sm font-semibold text-destructive">
                    Ya no está a la venta. Quítalo para seguir.
                  </p>
                } @else if (linea.estado === 'sin-stock') {
                  <p class="mt-1 text-sm font-semibold text-destructive">
                    @if (linea.disponible === 0) {
                      Se agotó. Quítalo para seguir.
                    } @else {
                      Quedan {{ linea.disponible }}: baja la cantidad para seguir.
                    }
                  </p>
                }

                <div class="mt-2 flex items-center gap-3">
                  @if (linea.estado !== 'no-disponible') {
                    <label class="sr-only" [for]="'cantidad-' + linea.varianteId">Cantidad</label>
                    <input
                      class="campo w-20"
                      type="number"
                      inputmode="numeric"
                      min="1"
                      max="99"
                      [id]="'cantidad-' + linea.varianteId"
                      [value]="linea.cantidad"
                      (change)="cambiar(linea.varianteId, $event)"
                    />
                  }
                  <button
                    type="button"
                    class="boton boton-texto boton-chico"
                    (click)="carrito.quitar(linea.varianteId)"
                  >
                    Quitar
                    <span class="sr-only">{{ linea.producto?.nombre ?? 'este producto' }}</span>
                  </button>
                </div>
              </div>

              @if (linea.precioUnitarioClp !== null) {
                <p class="font-semibold whitespace-nowrap">{{ pesos(linea.subtotalClp) }}</p>
              }
            </li>
          }
        </ul>

        <aside
          data-resumen
          class="h-fit rounded-xl border border-border bg-card p-5"
          aria-labelledby="titulo-resumen"
        >
          <h2 id="titulo-resumen" class="font-display text-lg font-bold tracking-wider uppercase">
            Resumen
          </h2>
          <dl class="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt>Subtotal</dt>
            <dd class="text-right">{{ pesos(cotizada.subtotalClp) }}</dd>
            @if (cotizada.descuentoClp > 0) {
              <dt class="text-primary">Descuento de socio</dt>
              <dd class="text-right text-primary">−{{ pesos(cotizada.descuentoClp) }}</dd>
            }
            <dt class="border-t border-border pt-2 text-base font-bold">Total</dt>
            <dd class="border-t border-border pt-2 text-right font-display text-2xl font-bold">
              {{ pesos(cotizada.totalClp) }}
            </dd>
          </dl>
          <p class="mt-2 text-xs text-muted-foreground">No incluye el despacho.</p>

          <!-- Hasta T166 no existe /tienda/pagar: un enlace ahí llevaba a la portada. Se
               avisa que el pago llega pronto, distinto de lo que falta arreglar. T166 vuelve
               a poner el enlace cuando sePuedePagar. -->
          @if (cotizada.sePuedePagar) {
            <p class="mt-4 text-sm text-muted-foreground">El pago en línea llega pronto.</p>
          } @else {
            <p class="mt-4 text-sm font-semibold text-destructive">
              Quita o ajusta lo marcado para seguir.
            </p>
          }
          <button type="button" class="mt-2 boton boton-primario w-full" disabled>
            Ir a pagar
          </button>

          @if (!usuario()) {
            <p class="mt-4 text-sm text-muted-foreground">
              ¿Eres socio del club?
              <a
                routerLink="/entrar"
                class="font-semibold text-primary underline-offset-4 hover:underline"
                >Entra</a
              >
              para pagar tu precio de socio.
            </p>
          }
        </aside>
      </div>
    } @else {
      <app-esqueleto class="mt-6 block" [filas]="3" etiqueta="Cargando el carrito…" />
    }
  `,
})
export class PaginaDelCarrito {
  protected readonly carrito = inject(Carrito);
  protected readonly usuario = inject(Auth).usuario;
  protected readonly pesos = enPesos;

  protected readonly cotizacion = resource({
    // Vacío no se cotiza: no hay nada que preguntar. Quien mira entra en los parámetros
    // para volver a cotizar al iniciar sesión.
    params: () => {
      const lineas = this.carrito.lineas();

      return lineas.length > 0 ? { lineas, usuario: this.usuario()?.id ?? null } : undefined;
    },
    loader: ({ params }) => this.carrito.cotizar(params.lineas),
  });

  /**
   * La última cotización que llegó. Mientras se cotiza de nuevo —cambiar una cantidad— se
   * sigue mostrando la anterior: sin esto, la lista entera parpadeaba a cada cambio.
   */
  protected readonly ultima = linkedSignal<Cotizacion | undefined, Cotizacion | undefined>({
    source: () => (this.cotizacion.hasValue() ? this.cotizacion.value() : undefined),
    computation: (nueva, anterior) => nueva ?? anterior?.value,
  });

  protected cambiar(varianteId: number, evento: Event): void {
    const cantidad = Number((evento.target as HTMLInputElement).value);

    if (Number.isInteger(cantidad)) this.carrito.cambiar(varianteId, cantidad);
  }
}
