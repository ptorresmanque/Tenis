import {
  afterNextRender,
  Component,
  inject,
  Injector,
  resource,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Campo, CampoControl } from '../../ui/campo';
import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { CatalogoDeLaTienda, CategoriaProducto } from './catalogo.service';

/** El ancho de `nombre` en `categoria_producto` (T156). */
const LARGO_DEL_NOMBRE = 80;

/** El tope del orden en la API, como en las preguntas frecuentes. */
const ORDEN_MAXIMO = 1000;

/**
 * Las categorías del catálogo de la tienda (T157).
 *
 * Con el patrón de las preguntas frecuentes: agregar arriba, la lista abajo, y corregir y
 * ordenar en la propia fila. **No se borran**: en cuanto haya productos, una categoría
 * tiene cosas colgando, y para un error de tipeo alcanza con editar.
 */
@Component({
  selector: 'app-categorias-de-la-tienda',
  imports: [FormsModule, Aviso, Campo, CampoControl, Esqueleto, EstadoVacio, Insignia],
  template: `
    <section aria-labelledby="titulo-categorias">
      <h2 id="titulo-categorias" class="rotulo-seccion" tabindex="-1">Categorías</h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Cómo se agrupa el catálogo en la tienda. Van en el orden de la lista: el número
        menor, más arriba.
      </p>

      <form class="mt-4 grid max-w-xl gap-4" (ngSubmit)="agregar()">
        <app-campo etiqueta="Nombre" [obligatorio]="true">
          <input
            appCampoControl
            name="nombre"
            class="campo"
            [maxlength]="LARGO_DEL_NOMBRE"
            [(ngModel)]="nueva.nombre"
          />
        </app-campo>

        <label class="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="usaTablaDeTallas"
            class="mt-1"
            [(ngModel)]="nueva.usaTablaDeTallas"
          />
          <span>
            Sus variantes son tallas de zapatilla
            <span class="text-muted-foreground">
              — se escriben en talla chilena y la tienda las muestra también en US y EU,
              con la tabla de la marca
            </span>
          </span>
        </label>

        <div>
          <button
            type="submit"
            class="boton boton-primario"
            [disabled]="enviando()"
            [attr.aria-busy]="enCurso() === 'agregar'"
          >
            Agregar la categoría
          </button>
        </div>
      </form>

      @if (origen() === null) {
        @if (error(); as falla) {
          <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
        } @else if (aviso(); as texto) {
          <app-aviso variante="exito" class="mt-3 block">{{ texto }}</app-aviso>
        }
      }
    </section>

    <section class="mt-8" aria-labelledby="listado-categorias">
      <h2 id="listado-categorias" class="sr-only">Categorías de la tienda</h2>

      <!-- El esqueleto, solo la primera vez: al recargar después de guardar, la lista se
           queda puesta y el foco no se pierde. -->
      @if (!categorias.hasValue() && categorias.isLoading()) {
        <app-esqueleto class="block" [filas]="3" etiqueta="Cargando las categorías…" />
      } @else if (categorias.error()) {
        <p class="text-destructive">
          No se pudieron cargar las categorías. Reintenta en un momento.
        </p>
      } @else if (lista().length === 0) {
        <app-estado-vacio
          icono="category"
          titulo="Todavía no hay categorías"
          detalle="Hacen falta para cargar productos. Agrega la primera arriba."
        />
      } @else {
        <ol class="grid gap-3">
          @for (categoria of lista(); track categoria.id) {
            <li class="rounded-xl border border-border bg-card p-4">
              @if (editando() === categoria.id) {
                <form class="grid gap-4" (ngSubmit)="guardar(categoria)">
                  <app-campo etiqueta="Nombre" [obligatorio]="true">
                    <input
                      appCampoControl
                      [id]="'editar-categoria-' + categoria.id"
                      name="nombre"
                      class="campo"
                      [maxlength]="LARGO_DEL_NOMBRE"
                      [(ngModel)]="borrador.nombre"
                    />
                  </app-campo>
                  <label class="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="usaTablaDeTallas"
                      class="mt-1"
                      [(ngModel)]="borrador.usaTablaDeTallas"
                    />
                    Sus variantes son tallas de zapatilla
                  </label>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      class="boton boton-primario boton-chico"
                      [disabled]="enviando()"
                      [attr.aria-busy]="enCurso() === 'guardar-' + categoria.id"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      class="boton boton-texto boton-chico"
                      (click)="cerrarEdicion(categoria.id)"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              } @else {
                <div class="flex items-start gap-4">
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold">{{ categoria.nombre }}</h3>
                    @if (categoria.usaTablaDeTallas) {
                      <app-insignia variante="info" icono="straighten" class="mt-2 block">
                        Tabla de tallas
                      </app-insignia>
                    }
                  </div>

                  <div>
                    <label class="sr-only" [for]="'orden-categoria-' + categoria.id">
                      Orden de «{{ categoria.nombre }}»
                    </label>
                    <input
                      [id]="'orden-categoria-' + categoria.id"
                      type="number"
                      min="0"
                      [max]="ORDEN_MAXIMO"
                      class="campo w-18 sm:w-24"
                      [value]="categoria.orden"
                      [disabled]="enviando()"
                      (change)="mover(categoria, $event)"
                    />
                  </div>
                </div>

                <div class="mt-3">
                  <button
                    type="button"
                    [id]="'editar-' + categoria.id"
                    class="boton boton-secundario boton-chico"
                    (click)="abrirEdicion(categoria)"
                  >
                    Editar
                    <span class="sr-only">«{{ categoria.nombre }}»</span>
                  </button>
                </div>
              }

              @if (origen() === categoria.id) {
                @if (error(); as falla) {
                  <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
                } @else if (aviso(); as texto) {
                  <app-aviso variante="exito" class="mt-3 block">{{ texto }}</app-aviso>
                }
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class CategoriasPanel {
  private readonly api = inject(CatalogoDeLaTienda);
  private readonly injector = inject(Injector);

  protected readonly LARGO_DEL_NOMBRE = LARGO_DEL_NOMBRE;
  protected readonly ORDEN_MAXIMO = ORDEN_MAXIMO;

  protected nueva = { nombre: '', usaTablaDeTallas: false };
  /** Lo que hay en la fila que se está corrigiendo. */
  protected borrador = { nombre: '', usaTablaDeTallas: false };

  protected readonly editando = signal<number | null>(null);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  /** Qué acción está viajando, para que gire su botón y no todos (T153). */
  protected readonly enCurso = signal<string | null>(null);
  /** De qué fila es el mensaje; nulo si es del formulario de agregar. */
  protected readonly origen = signal<number | null>(null);

  protected readonly categorias = resource({
    loader: () => this.api.listarCategorias(),
  });

  /** `value()` lanza en estado de error. */
  protected lista(): CategoriaProducto[] {
    return this.categorias.hasValue() ? this.categorias.value() : [];
  }

  protected async agregar(): Promise<void> {
    this.limpiarMensajes(null);

    const nombre = this.nueva.nombre.trim();
    if (!nombre) {
      this.error.set('Escribe el nombre de la categoría.');
      return;
    }

    await this.contra('agregar', async () => {
      await this.api.crearCategoria(nombre, this.nueva.usaTablaDeTallas);
      this.aviso.set(`«${nombre}» quedó al final de la lista.`);
      this.nueva = { nombre: '', usaTablaDeTallas: false };
    }, 'No se pudo agregar la categoría.');
  }

  protected abrirEdicion(categoria: CategoriaProducto): void {
    this.limpiarMensajes(categoria.id);
    this.borrador = {
      nombre: categoria.nombre,
      usaTablaDeTallas: categoria.usaTablaDeTallas,
    };
    this.editando.set(categoria.id);
    this.enfocar(`editar-categoria-${categoria.id}`);
  }

  /** De vuelta al botón que la abrió, si sigue abierta esa (como en las preguntas). */
  protected cerrarEdicion(id: number): void {
    if (this.editando() !== id) return;

    this.editando.set(null);
    this.enfocar(`editar-${id}`);
  }

  protected async guardar(categoria: CategoriaProducto): Promise<void> {
    this.limpiarMensajes(categoria.id);

    const nombre = this.borrador.nombre.trim();
    if (!nombre) {
      this.error.set('Escribe el nombre de la categoría.');
      return;
    }

    await this.contra(`guardar-${categoria.id}`, async () => {
      await this.api.editarCategoria(categoria.id, {
        nombre,
        usaTablaDeTallas: this.borrador.usaTablaDeTallas,
      });
      this.aviso.set('Categoría guardada.');
      this.cerrarEdicion(categoria.id);
    }, 'No se pudo guardar la categoría.');
  }

  /** Cambiar el número es cómo se reordena, como en las preguntas frecuentes. */
  protected async mover(categoria: CategoriaProducto, evento: Event): Promise<void> {
    const orden = Number((evento.target as HTMLInputElement).value);

    this.limpiarMensajes(categoria.id);

    if (!Number.isInteger(orden) || orden < 0 || orden > ORDEN_MAXIMO) {
      this.error.set(`El orden tiene que ser un número entero entre 0 y ${ORDEN_MAXIMO}.`);
      return;
    }

    await this.contra(`mover-${categoria.id}`, async () => {
      await this.api.editarCategoria(categoria.id, { orden });
      this.aviso.set(`«${categoria.nombre}» quedó con el orden ${orden}.`);
    }, 'No se pudo mover la categoría.');
  }

  /** Recarga siempre, incluso al fallar: el número escrito en una fila puede no ser el guardado. */
  private async contra(
    clave: string,
    accion: () => Promise<void>,
    porDefecto: string,
  ): Promise<void> {
    this.enviando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, porDefecto));
    } finally {
      this.enviando.set(false);
      this.enCurso.set(null);
      this.categorias.reload();
    }
  }

  /** Después de dibujar: el elemento puede no existir todavía. */
  private enfocar(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }

  private limpiarMensajes(origen: number | null): void {
    this.error.set(null);
    this.aviso.set(null);
    this.origen.set(origen);
  }
}
