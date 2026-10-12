import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { Insignia } from '../../ui/insignia';
import { CatalogoDeLaTienda } from './catalogo.service';
import { FotosDelProducto } from './fotos-producto';
import {
  DatosDelProducto,
  FichaDeProducto,
  ProductosDeLaTienda,
} from './productos.service';
import { VariantesDelProducto } from './variantes';

/** Los anchos de `producto` en la base y los topes de la API (T158). */
const LARGO_DEL_NOMBRE = 120;
const LARGO_DE_LA_DESCRIPCION = 4000;

/** El formulario de los datos: texto en los selectores y el precio como lo deja el campo. */
interface Formulario {
  nombre: string;
  descripcion: string;
  categoriaId: string;
  marcaId: string;
  precio: number | null;
}

/**
 * La ficha de un producto (T159): sus datos, su estado, sus variantes y sus fotos.
 *
 * `/administracion/tienda/productos/nuevo` crea uno en borrador y lleva a su ficha. Las
 * variantes y las fotos aparecen recién cuando el producto existe: cuelgan de su número.
 */
@Component({
  selector: 'app-ficha-de-producto',
  imports: [
    FormsModule,
    RouterLink,
    Aviso,
    Esqueleto,
    Insignia,
    VariantesDelProducto,
    FotosDelProducto,
  ],
  template: `
    <a routerLink="/administracion/tienda/productos" class="text-sm font-semibold text-primary">
      ← Productos
    </a>

    @if (!esNuevo() && !ficha.hasValue() && ficha.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="6" etiqueta="Cargando el producto…" />
    } @else if (!esNuevo() && ficha.error()) {
      <p class="mt-4 text-destructive">No se pudo cargar el producto. Reintenta en un momento.</p>
    } @else {
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <h2 class="rotulo-seccion">{{ esNuevo() ? 'Nuevo producto' : ficha.value()?.nombre }}</h2>
        @if (actual(); as producto) {
          @if (producto.archivado) {
            <app-insignia variante="neutro" icono="inventory_2">Archivado</app-insignia>
          } @else if (producto.publicado) {
            <app-insignia variante="exito">Publicado</app-insignia>
          } @else {
            <app-insignia variante="aviso" icono="edit_note">Borrador</app-insignia>
          }
        }
      </div>

      <form class="mt-4 grid max-w-2xl gap-4" (ngSubmit)="guardar()">
        <label class="grid gap-1 text-sm">
          <span class="font-medium">Nombre *</span>
          <input
            class="campo"
            name="nombre"
            [maxlength]="LARGO_DEL_NOMBRE"
            [(ngModel)]="formulario().nombre"
          />
        </label>

        <label class="grid gap-1 text-sm">
          <span class="font-medium">Descripción</span>
          <textarea
            class="campo"
            name="descripcion"
            rows="4"
            [maxlength]="LARGO_DE_LA_DESCRIPCION"
            [(ngModel)]="formulario().descripcion"
          ></textarea>
        </label>

        <div class="grid gap-4 sm:grid-cols-3">
          <label class="grid gap-1 text-sm">
            <span class="font-medium">Categoría *</span>
            <select class="campo" name="categoriaId" [(ngModel)]="formulario().categoriaId">
              <option value="">Elige…</option>
              @for (categoria of categorias(); track categoria.id) {
                <option [value]="'' + categoria.id">{{ categoria.nombre }}</option>
              }
            </select>
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium">Marca</span>
            <select class="campo" name="marcaId" [(ngModel)]="formulario().marcaId">
              <option value="">Sin marca</option>
              @for (marca of marcas(); track marca.id) {
                <option [value]="'' + marca.id">{{ marca.nombre }}</option>
              }
            </select>
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium">Precio con IVA *</span>
            <input
              class="campo"
              name="precio"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              [(ngModel)]="formulario().precio"
            />
          </label>
        </div>

        <div>
          <button
            type="submit"
            class="boton boton-primario"
            [disabled]="enviando()"
            [attr.aria-busy]="enCurso() === 'guardar'"
          >
            {{ esNuevo() ? 'Crear el producto' : 'Guardar los datos' }}
          </button>
        </div>
      </form>

      @if (actual(); as producto) {
        <div class="mt-6 flex flex-wrap gap-2">
          @if (producto.archivado) {
            <button
              type="button"
              class="boton boton-secundario"
              [disabled]="enviando()"
              [attr.aria-busy]="enCurso() === 'desarchivar'"
              (click)="cambiarEstado({ archivado: false }, 'desarchivar')"
            >
              Desarchivar
            </button>
          } @else {
            @if (producto.publicado) {
              <button
                type="button"
                class="boton boton-secundario"
                [disabled]="enviando()"
                [attr.aria-busy]="enCurso() === 'despublicar'"
                (click)="cambiarEstado({ publicado: false }, 'despublicar')"
              >
                Despublicar
              </button>
            } @else {
              <button
                type="button"
                class="boton boton-primario"
                [disabled]="enviando()"
                [attr.aria-busy]="enCurso() === 'publicar'"
                (click)="cambiarEstado({ publicado: true }, 'publicar')"
              >
                Publicar
              </button>
            }
            <button
              type="button"
              class="boton boton-texto"
              [disabled]="enviando()"
              [attr.aria-busy]="enCurso() === 'archivar'"
              (click)="cambiarEstado({ archivado: true }, 'archivar')"
            >
              Archivar
            </button>
          }
        </div>
      }

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      } @else if (aviso(); as texto) {
        <app-aviso variante="exito" class="mt-3 block">{{ texto }}</app-aviso>
      }

      @if (actual(); as producto) {
        <app-variantes-del-producto
          [productoId]="producto.id"
          [variantes]="producto.variantes"
          (cambiaron)="ficha.reload()"
        />
        <app-fotos-del-producto
          [productoId]="producto.id"
          [nombre]="producto.nombre"
          [fotos]="producto.fotos"
          (cambiaron)="ficha.reload()"
        />
      }
    }
  `,
})
export class FichaDeProductoPanel {
  private readonly api = inject(ProductosDeLaTienda);
  private readonly catalogo = inject(CatalogoDeLaTienda);
  private readonly router = inject(Router);

  /** El de la URL: un número, o "nuevo". */
  readonly id = input.required<string>();

  protected readonly LARGO_DEL_NOMBRE = LARGO_DEL_NOMBRE;
  protected readonly LARGO_DE_LA_DESCRIPCION = LARGO_DE_LA_DESCRIPCION;

  protected readonly esNuevo = computed(() => this.id() === 'nuevo');

  protected readonly ficha = resource({
    // Sin parámetros no carga: un producto nuevo todavía no tiene ficha que pedir.
    params: () => (this.esNuevo() ? undefined : Number(this.id())),
    loader: ({ params: id }) => this.api.ficha(id),
  });

  /** `value()` lanza en estado de error. */
  protected readonly actual = computed((): FichaDeProducto | null =>
    this.ficha.hasValue() ? (this.ficha.value() ?? null) : null,
  );

  /**
   * El número del producto cargado, como `computed` y no como una función suelta: un
   * `computed` avisa solo si su valor cambia, y la ficha recargada con el mismo producto
   * deja el mismo número. Con una función, el formulario se rearmaría en cada recarga.
   */
  private readonly idCargado = computed(() => this.actual()?.id ?? null);

  /**
   * Parte de lo guardado, y **vuelve a partir solo cuando cambia el producto**: de "nuevo"
   * al recién creado, o a otro. No en cada recarga: la ficha se recarga al agregar una
   * variante o una foto, y rearmar el formulario ahí borraría un precio a medio corregir
   * —y "Guardar" mandaría el viejo— sin que nadie lo note.
   */
  protected readonly formulario = linkedSignal<number | null, Formulario>({
    source: this.idCargado,
    computation: () => aFormulario(untracked(this.actual)),
  });

  private readonly listaDeCategorias = resource({
    loader: () => this.catalogo.listarCategorias(),
  });
  private readonly listaDeMarcas = resource({ loader: () => this.catalogo.listarMarcas() });

  protected readonly categorias = computed(() =>
    this.listaDeCategorias.hasValue() ? this.listaDeCategorias.value() : [],
  );
  protected readonly marcas = computed(() =>
    this.listaDeMarcas.hasValue() ? this.listaDeMarcas.value() : [],
  );

  protected readonly enviando = signal(false);
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected async guardar(): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);

    const datos = leerDatos(this.formulario());
    if (typeof datos === 'string') {
      this.error.set(datos);
      return;
    }

    await this.contra('guardar', async () => {
      if (this.esNuevo()) {
        const creado = await this.api.crear(datos);
        // replaceUrl: volver atrás no tiene que llevar a un formulario de "nuevo" vacío.
        await this.router.navigate(['/administracion/tienda/productos', creado.id], {
          replaceUrl: true,
        });
        return;
      }

      await this.api.editar(Number(this.id()), datos);
      this.aviso.set('Datos guardados.');
      this.ficha.reload();
    }, 'No se pudo guardar el producto.');
  }

  /** Publicar, despublicar, archivar o desarchivar. El servidor dice si se puede. */
  protected async cambiarEstado(
    cambio: { publicado: boolean } | { archivado: boolean },
    accion: 'publicar' | 'despublicar' | 'archivar' | 'desarchivar',
  ): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);

    await this.contra(accion, async () => {
      await this.api.editar(Number(this.id()), cambio);
      this.ficha.reload();
    }, 'No se pudo cambiar el estado del producto.');
  }

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
    }
  }
}

/** Lo guardado, en la forma del formulario. Vacío para un producto nuevo. */
function aFormulario(producto: FichaDeProducto | null): Formulario {
  return {
    nombre: producto?.nombre ?? '',
    descripcion: producto?.descripcion ?? '',
    categoriaId: producto ? String(producto.categoriaId) : '',
    marcaId: producto?.marcaId ? String(producto.marcaId) : '',
    precio: producto?.precioClp ?? null,
  };
}

/** Los datos listos para la API, o lo que falta, dicho para el admin. */
function leerDatos(formulario: Formulario): DatosDelProducto | string {
  const nombre = formulario.nombre.trim();
  const categoriaId = Number(formulario.categoriaId);
  const precio = formulario.precio;

  if (!nombre) return 'Escribe el nombre del producto.';
  if (!Number.isInteger(categoriaId) || categoriaId < 1) return 'Elige la categoría.';
  if (precio === null || !Number.isInteger(precio) || precio < 1) {
    return 'El precio es un número entero de pesos, mayor que cero.';
  }

  return {
    nombre,
    descripcion: formulario.descripcion.trim(),
    categoriaId,
    marcaId: formulario.marcaId ? Number(formulario.marcaId) : null,
    precioClp: precio,
  };
}
