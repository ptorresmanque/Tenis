import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { OpcionSelector, Selector } from '../../ui/selector';
import { CatalogoDeLaTienda } from './catalogo.service';
import { EstadoDeProducto, ProductoDeLaLista, ProductosDeLaTienda } from './productos.service';

const ESTADOS: OpcionSelector[] = [
  { valor: '', etiqueta: 'Vigentes' },
  { valor: 'borrador', etiqueta: 'Borradores' },
  { valor: 'publicado', etiqueta: 'Publicados' },
  { valor: 'archivado', etiqueta: 'Archivados' },
];

const STOCKS: OpcionSelector[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'bajo', etiqueta: 'Bajo' },
  { valor: 'negativo', etiqueta: 'Negativo' },
];

/**
 * Los productos de la tienda en el panel (T159).
 *
 * El estado y la categoría se le piden a la API; el filtro de stock se aplica acá, sobre
 * `stockMinimo`, **la variante más baja y no el total**: una talla en −1 detrás de otra
 * en +5 suma 4, y el total la escondería.
 */
@Component({
  selector: 'app-productos-de-la-tienda',
  imports: [RouterLink, Esqueleto, EstadoVacio, Insignia, Selector],
  template: `
    <section aria-labelledby="titulo-productos">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="titulo-productos" class="rotulo-seccion">Productos</h2>
          <p class="mt-2 max-w-prose text-sm text-muted-foreground">
            Un producto nace en borrador y se publica cuando tiene sus variantes. Lo que ya no se
            vende se archiva: nunca se borra.
          </p>
        </div>
        <a routerLink="/administracion/tienda/productos/nuevo" class="boton boton-primario">
          Nuevo producto
        </a>
      </div>

      <div class="mt-4 flex flex-wrap items-end gap-4">
        <app-selector
          etiqueta="Estado de los productos"
          [opciones]="ESTADOS"
          [valor]="estado()"
          (valorChange)="estado.set(aEstado($event))"
        />

        <label class="grid gap-1 text-sm">
          <span class="font-medium">Categoría</span>
          <select class="campo" [value]="categoriaId() ?? ''" (change)="elegirCategoria($event)">
            <option value="">Todas</option>
            @for (categoria of listaDeCategorias(); track categoria.id) {
              <option [value]="categoria.id">{{ categoria.nombre }}</option>
            }
          </select>
        </label>

        <div class="grid gap-1 text-sm">
          <span class="font-medium" aria-hidden="true">Stock</span>
          <app-selector
            etiqueta="Stock de las variantes"
            [opciones]="STOCKS"
            [valor]="stock()"
            (valorChange)="stock.set($event)"
          />
        </div>
      </div>

      @if (!productos.hasValue() && productos.isLoading()) {
        <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando los productos…" />
      } @else if (productos.error()) {
        <p class="mt-4 text-destructive">
          No se pudieron cargar los productos. Reintenta en un momento.
        </p>
      } @else if (visibles().length === 0) {
        <app-estado-vacio
          class="mt-4 block"
          icono="inventory_2"
          [titulo]="hayFiltros() ? 'Ningún producto coincide' : 'Todavía no hay productos'"
          [detalle]="
            hayFiltros()
              ? 'Prueba con otro estado, otra categoría u otro stock.'
              : 'Crea el primero con Nuevo producto.'
          "
        />
      } @else {
        <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table class="tabla">
            <caption class="sr-only">
              Productos de la tienda,
              {{
                visibles().length
              }}
              en la lista
            </caption>
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">Foto</span></th>
                <th scope="col">Producto</th>
                <th scope="col" class="numero">Precio</th>
                <th scope="col">Estado</th>
                <th scope="col" class="numero">Stock</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (producto of visibles(); track producto.id) {
                <tr>
                  <td class="w-16">
                    @if (producto.foto) {
                      <img
                        [src]="producto.foto"
                        alt=""
                        width="48"
                        height="48"
                        loading="lazy"
                        class="size-12 rounded-md object-cover"
                      />
                    } @else {
                      <span
                        class="icono grid size-12 place-items-center rounded-md bg-muted text-muted-foreground"
                        aria-hidden="true"
                        >image</span
                      >
                    }
                  </td>
                  <th scope="row">
                    <span class="font-semibold">{{ producto.nombre }}</span>
                    <span class="block text-sm text-muted-foreground">
                      {{ producto.categoria.nombre
                      }}{{ producto.marca ? ' · ' + producto.marca.nombre : '' }}
                    </span>
                  </th>
                  <td class="numero whitespace-nowrap">{{ pesos(producto.precioClp) }}</td>
                  <td>
                    @if (producto.archivado) {
                      <app-insignia variante="neutro" icono="inventory_2">Archivado</app-insignia>
                    } @else if (producto.publicado) {
                      <app-insignia variante="exito">Publicado</app-insignia>
                    } @else {
                      <app-insignia variante="aviso" icono="edit_note">Borrador</app-insignia>
                    }
                  </td>
                  <td class="numero">
                    <span [class.text-destructive]="(producto.stockMinimo ?? 0) < 0">
                      {{ producto.stockTotal }}
                    </span>
                    @if ((producto.stockMinimo ?? 0) < 0) {
                      <span class="block text-xs text-destructive">una variante en negativo</span>
                    }
                  </td>
                  <td>
                    <a
                      class="boton boton-secundario boton-chico whitespace-nowrap"
                      [routerLink]="['/administracion/tienda/productos', producto.id]"
                    >
                      Editar
                      <span class="sr-only">{{ producto.nombre }}</span>
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class ProductosPanel {
  private readonly api = inject(ProductosDeLaTienda);
  private readonly catalogo = inject(CatalogoDeLaTienda);

  protected readonly ESTADOS = ESTADOS;
  protected readonly STOCKS = STOCKS;

  protected readonly estado = signal<'' | EstadoDeProducto>('');
  protected readonly categoriaId = signal<number | null>(null);
  protected readonly stock = signal('todos');

  protected readonly productos = resource({
    params: () => ({ estado: this.estado() || null, categoriaId: this.categoriaId() }),
    loader: ({ params }) => this.api.listar(params),
  });

  protected readonly categorias = resource({
    loader: () => this.catalogo.listarCategorias(),
  });

  protected readonly listaDeCategorias = computed(() =>
    this.categorias.hasValue() ? this.categorias.value() : [],
  );

  /** La lista con el filtro de stock, sobre la variante más baja. */
  protected readonly visibles = computed((): ProductoDeLaLista[] => {
    const lista = this.productos.hasValue() ? this.productos.value() : [];
    const stock = this.stock();

    if (stock === 'negativo') {
      return lista.filter((p) => p.stockMinimo !== null && p.stockMinimo < 0);
    }
    if (stock === 'bajo') {
      // La API lo marca con el umbral de la configuración (T172).
      return lista.filter((p) => p.stockBajo);
    }

    return lista;
  });

  protected readonly hayFiltros = computed(
    () => this.estado() !== '' || this.categoriaId() !== null || this.stock() !== 'todos',
  );

  protected aEstado(valor: string): '' | EstadoDeProducto {
    return valor === 'borrador' || valor === 'publicado' || valor === 'archivado' ? valor : '';
  }

  protected elegirCategoria(evento: Event): void {
    const valor = Number((evento.target as HTMLSelectElement).value);

    this.categoriaId.set(Number.isInteger(valor) && valor > 0 ? valor : null);
  }

  protected pesos(monto: number): string {
    return `$${monto.toLocaleString('es-CL')}`;
  }
}
