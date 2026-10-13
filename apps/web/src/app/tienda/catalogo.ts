import { Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { Auth } from '../core/auth/auth';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { Insignia } from '../ui/insignia';
import { Selector } from '../ui/selector';
import { Carrito } from './carrito';
import { FiltroDelCatalogo, OrdenDelCatalogo, Tienda } from './tienda.service';

const ORDENES: { valor: OrdenDelCatalogo; etiqueta: string }[] = [
  { valor: 'novedad', etiqueta: 'Lo más nuevo' },
  { valor: 'precio-asc', etiqueta: 'Precio: de menor a mayor' },
  { valor: 'precio-desc', etiqueta: 'Precio: de mayor a menor' },
];

/** Lo que va en la URL. El orden por omisión no se escribe: es el de siempre. */
type CambioDeFiltro = Partial<Record<keyof FiltroDelCatalogo, string | number | null>>;

/**
 * La tienda en línea, `/tienda` (T162): categorías, filtros y orden.
 *
 * **Los filtros viven en la URL**, como la fecha de la disponibilidad: quien abre una ficha
 * y vuelve atrás encuentra la lista como la dejó, y un enlace con filtros se comparte. Se
 * reemplaza la entrada del historial en vez de sumar una: "atrás" lleva a la página
 * anterior, no al filtro anterior.
 *
 * Es una pantalla de tarea: nada anima al hacer scroll.
 */
@Component({
  selector: 'app-tienda-en-linea',
  imports: [RouterLink, Esqueleto, EstadoVacio, Insignia, Selector],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h1 class="titular text-5xl sm:text-6xl">Tienda</h1>
      @if (unidadesEnCarrito() > 0) {
        <a routerLink="/tienda/carrito" class="boton boton-secundario">
          <span class="icono" aria-hidden="true">shopping_cart</span>
          Ver el carrito ({{ unidadesEnCarrito() }})
        </a>
      }
    </div>
    <p class="mt-2 max-w-prose text-lg text-muted-foreground">
      Lo que vende la tienda del club: raquetas, zapatillas, ropa, pelotas y más.
    </p>
    @if (!usuario()) {
      <p class="mt-1 text-muted-foreground">
        ¿Eres socio del club?
        <a
          routerLink="/entrar"
          class="font-semibold text-primary underline-offset-4 hover:underline"
          >Entra</a
        >
        para ver tu precio de socio.
      </p>
    }

    @if (filtros()?.arriendoRaquetas; as arriendo) {
      <aside
        data-arriendo
        class="mt-4 flex max-w-prose gap-3 rounded-xl border border-border bg-card p-4"
        aria-label="Arriendo de raquetas"
      >
        <span class="icono text-xl text-primary" aria-hidden="true">sports_tennis</span>
        <p class="whitespace-pre-line">{{ arriendo }}</p>
      </aside>
    }

    @if (filtros(); as hay) {
      <div class="mt-6 grid gap-4">
        <app-selector
          etiqueta="Categoría"
          estilo="chips"
          [opciones]="categorias()"
          [valor]="filtro().categoriaId === null ? '' : '' + filtro().categoriaId"
          (valorChange)="cambiar({ categoriaId: $event || null })"
        />

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          @if (hay.marcas.length > 0) {
            <div class="grid gap-1 text-sm">
              <label for="filtro-marca" class="font-medium">Marca</label>
              <select
                id="filtro-marca"
                class="campo"
                (change)="cambiar({ marcaId: valorDe($event) })"
              >
                <option value="">Todas</option>
                @for (marca of hay.marcas; track marca.id) {
                  <option [value]="marca.id" [selected]="marca.id === filtro().marcaId">
                    {{ marca.nombre }}
                  </option>
                }
              </select>
            </div>
          }
          @if (hay.tallas.length > 0) {
            <div class="grid gap-1 text-sm">
              <label for="filtro-talla" class="font-medium">Talla</label>
              <select
                id="filtro-talla"
                class="campo"
                (change)="cambiar({ talla: valorDe($event) })"
              >
                <option value="">Todas</option>
                @for (talla of hay.tallas; track talla) {
                  <option [value]="talla" [selected]="talla === filtro().talla">{{ talla }}</option>
                }
              </select>
            </div>
          }
          <div class="grid gap-1 text-sm">
            <label for="filtro-desde" class="font-medium">Desde ($)</label>
            <input
              id="filtro-desde"
              name="precioMin"
              class="campo"
              type="number"
              inputmode="numeric"
              min="0"
              step="1000"
              [placeholder]="hay.precioMin ?? ''"
              [value]="filtro().precioMin ?? ''"
              (change)="cambiar({ precioMin: pesosDe($event) })"
            />
          </div>
          <div class="grid gap-1 text-sm">
            <label for="filtro-hasta" class="font-medium">Hasta ($)</label>
            <input
              id="filtro-hasta"
              name="precioMax"
              class="campo"
              type="number"
              inputmode="numeric"
              min="0"
              step="1000"
              [placeholder]="hay.precioMax ?? ''"
              [value]="filtro().precioMax ?? ''"
              (change)="cambiar({ precioMax: pesosDe($event) })"
            />
          </div>
          <div class="col-span-2 grid gap-1 text-sm sm:col-span-1">
            <label for="filtro-orden" class="font-medium">Ordenar por</label>
            <select
              id="filtro-orden"
              class="campo"
              (change)="cambiar({ orden: valorDe($event) === 'novedad' ? null : valorDe($event) })"
            >
              @for (orden of ORDENES; track orden.valor) {
                <option [value]="orden.valor" [selected]="orden.valor === filtro().orden">
                  {{ orden.etiqueta }}
                </option>
              }
            </select>
          </div>
        </div>
      </div>
    }

    <div class="mt-6">
      @if (!productos.hasValue() && productos.isLoading()) {
        <app-esqueleto [filas]="6" etiqueta="Cargando los productos…" />
      } @else if (productos.error()) {
        <p class="text-destructive">No se pudo cargar la tienda. Reintenta en un momento.</p>
      } @else if (productos.value()?.length === 0) {
        @if (hayFiltros()) {
          <app-estado-vacio
            icono="filter_alt_off"
            titulo="Nada calza con esos filtros"
            detalle="Prueba con otra talla, otra marca u otro rango de precio."
          />
          <p class="mt-4 text-center">
            <button type="button" class="boton boton-secundario" (click)="quitarFiltros()">
              Quitar los filtros
            </button>
          </p>
        } @else {
          <app-estado-vacio
            icono="storefront"
            titulo="La tienda está armando su catálogo"
            detalle="Vuelve pronto, o escríbenos para preguntar por un producto."
          />
        }
      } @else {
        <ul
          aria-label="Productos de la tienda"
          class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
        >
          @for (producto of productos.value(); track producto.id) {
            <li>
              <a
                [routerLink]="['/tienda', producto.id]"
                class="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card
                       shadow-sm transition-shadow hover:shadow-md"
              >
                <div class="relative aspect-square bg-muted">
                  @if (producto.foto) {
                    <img
                      [src]="producto.foto"
                      alt=""
                      width="400"
                      height="400"
                      loading="lazy"
                      decoding="async"
                      class="size-full object-cover"
                    />
                  } @else {
                    <span
                      class="icono grid size-full place-items-center text-4xl text-muted-foreground"
                      aria-hidden="true"
                      >image</span
                    >
                  }
                  @if (producto.porEncargo) {
                    <app-insignia
                      class="absolute top-2 left-2"
                      variante="info"
                      icono="local_shipping"
                      >Por encargo</app-insignia
                    >
                  } @else if (producto.agotado) {
                    <app-insignia
                      class="absolute top-2 left-2"
                      variante="neutro"
                      icono="remove_shopping_cart"
                      >Agotado</app-insignia
                    >
                  }
                </div>
                <div class="flex flex-1 flex-col gap-0.5 p-3">
                  @if (producto.marca) {
                    <span
                      class="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                      >{{ producto.marca.nombre }}</span
                    >
                  }
                  <span class="leading-snug font-semibold">{{ producto.nombre }}</span>
                  <span class="mt-auto pt-2 font-display text-lg font-bold">{{
                    pesos(producto.precioClp)
                  }}</span>
                  @if (producto.precioSocioClp !== null) {
                    <span class="text-sm font-semibold text-primary"
                      >Socio {{ pesos(producto.precioSocioClp) }}</span
                    >
                  }
                </div>
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class TiendaEnLinea {
  private readonly tienda = inject(Tienda);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly usuario = inject(Auth).usuario;
  protected readonly unidadesEnCarrito = inject(Carrito).unidades;
  protected readonly filtros = this.tienda.filtros;
  protected readonly ORDENES = ORDENES;
  protected readonly pesos = enPesos;

  private readonly parametros = toSignal(this.ruta.queryParamMap);

  /** Lo que dice la URL. Lo que no se entiende se ignora, en vez de llevarlo a la API. */
  protected readonly filtro = computed<FiltroDelCatalogo>(() => leerFiltro(this.parametros()));

  /** El orden no cuenta: no deja nada afuera. */
  protected readonly hayFiltros = computed(() => {
    const { categoriaId, marcaId, talla, precioMin, precioMax } = this.filtro();

    return [categoriaId, marcaId, talla, precioMin, precioMax].some((valor) => valor !== null);
  });

  protected readonly categorias = computed(() => [
    { valor: '', etiqueta: 'Todo' },
    ...(this.filtros()?.categorias ?? []).map((c) => ({ valor: String(c.id), etiqueta: c.nombre })),
  ]);

  protected readonly productos = resource({
    params: () => this.filtro(),
    loader: ({ params }) => this.tienda.productos(params),
  });

  protected cambiar(cambio: CambioDeFiltro): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: cambio,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected quitarFiltros(): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { orden: this.parametros()?.get('orden') ?? null },
      replaceUrl: true,
    });
  }

  protected valorDe(evento: Event): string | null {
    return (evento.target as HTMLSelectElement).value || null;
  }

  /** Un monto que no es un entero desde cero se ignora: no hay "desde -5". */
  protected pesosDe(evento: Event): number | null {
    return entero((evento.target as HTMLInputElement).value, 0);
  }
}

function leerFiltro(parametros: ParamMap | undefined): FiltroDelCatalogo {
  const orden = parametros?.get('orden');

  return {
    categoriaId: entero(parametros?.get('categoriaId'), 1),
    marcaId: entero(parametros?.get('marcaId'), 1),
    talla: parametros?.get('talla') || null,
    precioMin: entero(parametros?.get('precioMin'), 0),
    precioMax: entero(parametros?.get('precioMax'), 0),
    orden: ORDENES.some((o) => o.valor === orden) ? (orden as OrdenDelCatalogo) : 'novedad',
  };
}

function entero(valor: string | null | undefined, minimo: number): number | null {
  const numero = valor ? Number(valor) : NaN;

  return Number.isInteger(numero) && numero >= minimo ? numero : null;
}
