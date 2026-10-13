import { Component, computed, inject, input, linkedSignal, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { Auth } from '../core/auth/auth';
import { Aviso } from '../ui/aviso';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { Insignia } from '../ui/insignia';
import { CANTIDAD_MAXIMA, Carrito } from './carrito';
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
 * Desde T163 se elige una variante y una cantidad, y se lleva al carrito. Lo agotado no se
 * puede elegir; lo que acepta encargo llega en T170.
 */
@Component({
  selector: 'app-ficha-del-producto',
  imports: [RouterLink, Aviso, Esqueleto, EstadoVacio, Insignia],
  template: `
    <p class="flex flex-wrap items-center justify-between gap-3">
      <a
        routerLink="/tienda"
        class="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4
               hover:underline"
      >
        <span class="icono text-lg" aria-hidden="true">arrow_back</span>
        Volver a la tienda
      </a>
      @if (unidadesEnCarrito() > 0) {
        <a routerLink="/tienda/carrito" class="boton boton-secundario boton-chico">
          <span class="icono" aria-hidden="true">shopping_cart</span>
          Ver el carrito ({{ unidadesEnCarrito() }})
        </a>
      }
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
                    [class.border-primary]="i === fotoElegida()"
                    [class.border-transparent]="i !== fotoElegida()"
                    [attr.aria-pressed]="i === fotoElegida()"
                    [attr.aria-label]="'Ver la foto ' + (i + 1) + ' de ' + producto.fotos.length"
                    (click)="fotoElegida.set(i)"
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

          <fieldset class="mt-8">
            <legend class="font-display text-lg font-bold tracking-wider uppercase">
              Disponibilidad
            </legend>
            <ul class="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
              @for (variante of producto.variantes; track variante.id) {
                <li>
                  <label
                    data-variante
                    class="flex cursor-pointer items-center gap-3 px-4 py-3
                           has-[:checked]:bg-primary/5 has-[:disabled]:cursor-not-allowed"
                  >
                    <input
                      type="radio"
                      name="variante"
                      class="size-4 accent-primary"
                      [value]="variante.id"
                      [checked]="variante.id === elegidaId()"
                      [disabled]="variante.disponible === 0 && !producto.aceptaEncargo"
                      (change)="elegidaId.set(variante.id)"
                    />
                    <span data-talla class="flex-1 font-medium">{{ variante.talla }}</span>
                    @if (variante.disponible === 0 && producto.aceptaEncargo) {
                      <app-insignia variante="info" icono="local_shipping"
                        >Por encargo: llega en {{ producto.diasEncargo }} días</app-insignia
                      >
                    } @else if (variante.disponible === 0) {
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
                  </label>
                </li>
              }
            </ul>
          </fieldset>

          @if (todoAgotado()) {
            <p class="mt-3 text-muted-foreground">Se agotó en todas sus opciones.</p>
          } @else {
            <div class="mt-4 flex flex-wrap items-end gap-3">
              <div class="grid gap-1 text-sm">
                <label for="cantidad" class="font-medium">Cantidad</label>
                <input
                  id="cantidad"
                  class="campo w-24"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  [max]="maximo()"
                  [value]="cantidad()"
                  [disabled]="!elegida()"
                  (input)="leerCantidad($event)"
                />
              </div>
              <button
                type="button"
                class="boton boton-primario"
                [disabled]="!elegida()"
                (click)="agregar()"
              >
                <span class="icono" aria-hidden="true">add_shopping_cart</span>
                Agregar al carrito
              </button>
            </div>
            @if (!elegida()) {
              <p class="mt-2 text-sm text-muted-foreground">Elige una opción para agregarla.</p>
            } @else if (producto.aceptaEncargo && cantidad() > (elegida()?.disponible ?? 0)) {
              <p class="mt-2 text-sm text-muted-foreground">
                Lo que falta va por encargo: llega en {{ producto.diasEncargo }} días y se retira en
                el club.
              </p>
            }
          }

          @if (agregada(); as talla) {
            <app-aviso class="mt-4 block" variante="exito">
              Agregaste {{ talla }} al carrito.
              <a routerLink="/tienda/carrito" class="font-semibold underline">Ver el carrito</a>
            </app-aviso>
          }

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

  private readonly carrito = inject(Carrito);
  protected readonly unidadesEnCarrito = this.carrito.unidades;

  private readonly producto = computed(() => (this.ficha.hasValue() ? this.ficha.value() : null));

  /** La variante elegida. Si el producto tiene una sola y queda, ya viene elegida. */
  protected readonly elegidaId = linkedSignal<number | null>(() => {
    const variantes = this.producto()?.variantes ?? [];

    const producto = this.producto();
    const vendible =
      variantes.length === 1 && (variantes[0].disponible > 0 || !!producto?.aceptaEncargo);

    return vendible ? variantes[0].id : null;
  });

  protected readonly elegida = computed(
    () => this.producto()?.variantes.find((v) => v.id === this.elegidaId()) ?? null,
  );

  /** Sin nada en ninguna opción y sin encargo: no hay qué agregar. */
  protected readonly todoAgotado = computed(() => {
    const producto = this.producto();

    return (
      !!producto && !producto.aceptaEncargo && producto.variantes.every((v) => v.disponible === 0)
    );
  });

  /**
   * Lo que queda de la elegida, y nunca más de lo que acepta un carrito. Con encargo, el tope
   * es el del carrito: lo que falta se encarga (T170).
   */
  protected readonly maximo = computed(() =>
    this.producto()?.aceptaEncargo
      ? CANTIDAD_MAXIMA
      : Math.min(this.elegida()?.disponible ?? 1, CANTIDAD_MAXIMA),
  );

  /** Vuelve a 1 al cambiar de variante. */
  protected readonly cantidad = linkedSignal({ source: this.elegidaId, computation: () => 1 });

  /** La talla que se acaba de agregar, para decirlo. Se olvida al cambiar de producto. */
  protected readonly agregada = linkedSignal<string | null>(() => {
    this.producto();

    return null;
  });

  protected leerCantidad(evento: Event): void {
    const cantidad = Number((evento.target as HTMLInputElement).value);

    if (Number.isInteger(cantidad)) this.cantidad.set(cantidad);
  }

  /** Entre 1 y lo que queda: el campo numérico deja escribir cualquier cosa. */
  protected agregar(): void {
    const variante = this.elegida();
    if (!variante) return;

    this.carrito.agregar(variante.id, Math.max(1, Math.min(this.cantidad(), this.maximo())));
    this.agregada.set(variante.talla);
  }

  /** La foto en grande. Vuelve a la primera al cambiar de producto. */
  protected readonly fotoElegida = linkedSignal({
    source: () => this.id(),
    computation: () => 0,
  });

  protected readonly fotoGrande = computed(() => {
    const fotos = this.ficha.value()?.fotos ?? [];

    return fotos[this.fotoElegida()] ?? fotos[0] ?? null;
  });

  /** El socio activo con la cuota atrasada: tiene que saber por qué no ve su precio. */
  protected readonly moroso = computed(() => {
    const usuario = this.usuario();

    return usuario?.socioActivo === true && !usuario.socioAlDia;
  });
}
