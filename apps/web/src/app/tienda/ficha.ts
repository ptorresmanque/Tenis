import { Component, computed, inject, input, linkedSignal, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { Auth } from '../core/auth/auth';
import { Aviso } from '../ui/aviso';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { Insignia } from '../ui/insignia';
import { Tienda } from './tienda.service';

/**
 * Hasta cuántas unidades se cuentan ("Quedan 2"). Más que eso es "Disponible": que
 * queden 37 no le cambia nada a quien compra una.
 */
const POCAS = 5;

/**
 * La ficha de un producto, `/tienda/:id` (T162): la galería, el precio —el de socio si
 * quien mira lo tiene—, cada variante con lo que queda y la tabla de tallas de la marca.
 *
 * Elegir una variante y llevarla al carrito llega con el carrito (T163).
 */
@Component({
  selector: 'app-ficha-del-producto',
  imports: [RouterLink, Aviso, Esqueleto, EstadoVacio, Insignia],
  template: `
    <p>
      <a
        routerLink="/tienda"
        class="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4
               hover:underline"
      >
        <span class="icono text-lg" aria-hidden="true">arrow_back</span>
        Volver a la tienda
      </a>
    </p>

    @if (ficha.isLoading()) {
      <app-esqueleto class="mt-6 block" [filas]="6" etiqueta="Cargando el producto…" />
    } @else if (ficha.error()) {
      <p class="mt-6 text-destructive">No se pudo cargar el producto. Reintenta en un momento.</p>
    } @else if (ficha.value(); as producto) {
      <article class="mt-6 grid gap-8 md:grid-cols-2">
        <div class="min-w-0">
          <figure class="aspect-square overflow-hidden rounded-xl bg-muted">
            @if (fotoGrande(); as foto) {
              <img
                [src]="foto.imagen"
                [alt]="producto.nombre"
                width="1600"
                height="1600"
                class="size-full object-contain"
              />
            } @else {
              <span
                class="icono grid size-full place-items-center text-6xl text-muted-foreground"
                aria-hidden="true"
                >image</span
              >
            }
          </figure>
          @if (producto.fotos.length > 1) {
            <ul class="mt-3 grid grid-cols-5 gap-2" aria-label="Fotos del producto">
              @for (foto of producto.fotos; track foto.id; let i = $index) {
                <li>
                  <button
                    type="button"
                    class="block w-full cursor-pointer overflow-hidden rounded-lg border-2
                           transition-colors"
                    [class.border-primary]="i === elegida()"
                    [class.border-transparent]="i !== elegida()"
                    [attr.aria-pressed]="i === elegida()"
                    [attr.aria-label]="'Ver la foto ' + (i + 1) + ' de ' + producto.fotos.length"
                    (click)="elegida.set(i)"
                  >
                    <img
                      [src]="foto.miniatura"
                      alt=""
                      width="400"
                      height="400"
                      loading="lazy"
                      class="aspect-square w-full object-cover"
                    />
                  </button>
                </li>
              }
            </ul>
          }
        </div>

        <div class="min-w-0">
          @if (producto.marca) {
            <p class="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              {{ producto.marca.nombre }}
            </p>
          }
          <h1 class="titular text-4xl sm:text-5xl">{{ producto.nombre }}</h1>

          <div data-precio class="mt-4">
            @if (producto.precioSocioClp !== null) {
              <p class="text-sm font-semibold text-primary">Precio socio</p>
              <p class="font-display text-4xl font-bold">{{ pesos(producto.precioSocioClp) }}</p>
              <p class="text-muted-foreground">Precio normal {{ pesos(producto.precioClp) }}</p>
            } @else {
              <p class="font-display text-4xl font-bold">{{ pesos(producto.precioClp) }}</p>
            }
          </div>

          @if (moroso()) {
            <app-aviso class="mt-4 block" variante="aviso">
              Tu descuento de socio vuelve cuando estés al día con la cuota.
              <a routerLink="/mi-cuenta" class="font-semibold underline">Ve tu cuenta</a>.
            </app-aviso>
          } @else if (!usuario()) {
            <p class="mt-2 text-muted-foreground">
              ¿Eres socio del club?
              <a
                routerLink="/entrar"
                class="font-semibold text-primary underline-offset-4 hover:underline"
                >Entra</a
              >
              para ver tu precio de socio.
            </p>
          }

          <h2 class="mt-8 font-display text-lg font-bold tracking-wider uppercase">
            Disponibilidad
          </h2>
          <ul class="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
            @for (variante of producto.variantes; track variante.id) {
              <li data-variante class="flex items-center justify-between gap-3 px-4 py-3">
                <span class="font-medium">{{ variante.talla }}</span>
                @if (variante.disponible === 0) {
                  <app-insignia variante="neutro" icono="remove_shopping_cart"
                    >Agotado</app-insignia
                  >
                } @else if (variante.disponible <= POCAS) {
                  <app-insignia variante="aviso" icono="inventory_2"
                    >Quedan {{ variante.disponible }}</app-insignia
                  >
                } @else {
                  <app-insignia variante="exito">Disponible</app-insignia>
                }
              </li>
            }
          </ul>

          @if (producto.tallas.length > 0) {
            <details class="mt-4 rounded-xl border border-border bg-card">
              <summary class="cursor-pointer px-4 py-3 font-semibold">
                Tabla de tallas de {{ producto.marca?.nombre ?? 'la marca' }}
              </summary>
              <div class="overflow-x-auto px-4 pb-4">
                <table class="tabla tabla-densa">
                  <caption class="sr-only">
                    Equivalencias de tallas: chilena, de Estados Unidos y europea
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" class="text-center">CL</th>
                      <th scope="col" class="text-center">US</th>
                      <th scope="col" class="text-center">EU</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (fila of producto.tallas; track fila.tallaCl) {
                      <tr>
                        <td class="text-center">{{ fila.tallaCl }}</td>
                        <td class="text-center">{{ fila.tallaUs }}</td>
                        <td class="text-center">{{ fila.tallaEu }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </details>
          }

          @if (producto.descripcion) {
            <p class="mt-6 max-w-prose whitespace-pre-line">{{ producto.descripcion }}</p>
          }
        </div>
      </article>
    } @else {
      <app-estado-vacio
        class="mt-6 block"
        icono="storefront"
        titulo="Este producto no está a la venta"
        detalle="Puede que se haya agotado del todo o que el club lo haya sacado de la tienda."
      />
    }
  `,
})
export class FichaDelProducto {
  private readonly tienda = inject(Tienda);

  /** Llega de la URL, `/tienda/:id`, con `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly usuario = inject(Auth).usuario;
  protected readonly pesos = enPesos;
  protected readonly POCAS = POCAS;

  protected readonly ficha = resource({
    params: () => ({ id: Number(this.id()) }),
    // Un número que no es un id no se le pregunta a la API: es un producto que no existe.
    loader: ({ params }) =>
      Number.isInteger(params.id) && params.id > 0
        ? this.tienda.ficha(params.id)
        : Promise.resolve(null),
  });

  /** La foto en grande. Vuelve a la primera al cambiar de producto. */
  protected readonly elegida = linkedSignal({
    source: () => this.id(),
    computation: () => 0,
  });

  protected readonly fotoGrande = computed(() => {
    const fotos = this.ficha.value()?.fotos ?? [];

    return fotos[this.elegida()] ?? fotos[0] ?? null;
  });

  /** El socio activo con la cuota atrasada: tiene que saber por qué no ve su precio. */
  protected readonly moroso = computed(() => {
    const usuario = this.usuario();

    return usuario?.socioActivo === true && !usuario.socioAlDia;
  });
}
