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
import { CatalogoDeLaTienda, Marca } from './catalogo.service';
import { TablaDeTallas } from './tabla-de-tallas';

/** El ancho de `nombre` en `marca` (T156). */
const LARGO_DEL_NOMBRE = 80;

/**
 * Las marcas de la tienda y la tabla de tallas de cada una (T157).
 *
 * Con el patrón de las categorías: agregar arriba y corregir en la fila. La tabla de
 * tallas se abre en la fila de su marca y se carga recién ahí: la mayoría de las marcas
 * no vende zapatillas y no la tiene.
 */
@Component({
  selector: 'app-marcas-de-la-tienda',
  imports: [FormsModule, Aviso, Campo, CampoControl, Esqueleto, EstadoVacio, TablaDeTallas],
  template: `
    <section aria-labelledby="titulo-marcas">
      <h2 id="titulo-marcas" class="rotulo-seccion" tabindex="-1">Marcas y tallas</h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Las marcas de los productos. La tabla de tallas de una marca es la que convierte la
        talla chilena de sus zapatillas a US y EU.
      </p>

      <form class="mt-4 grid max-w-xl gap-4" (ngSubmit)="agregar()">
        <app-campo etiqueta="Nombre" [obligatorio]="true">
          <input
            appCampoControl
            name="nombre"
            class="campo"
            [maxlength]="LARGO_DEL_NOMBRE"
            [(ngModel)]="nueva"
          />
        </app-campo>

        <div>
          <button
            type="submit"
            class="boton boton-primario"
            [disabled]="enviando()"
            [attr.aria-busy]="enCurso() === 'agregar'"
          >
            Agregar la marca
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

    <section class="mt-8" aria-labelledby="listado-marcas">
      <h2 id="listado-marcas" class="sr-only">Marcas de la tienda</h2>

      @if (!marcas.hasValue() && marcas.isLoading()) {
        <app-esqueleto class="block" [filas]="3" etiqueta="Cargando las marcas…" />
      } @else if (marcas.error()) {
        <p class="text-destructive">No se pudieron cargar las marcas. Reintenta en un momento.</p>
      } @else if (lista().length === 0) {
        <app-estado-vacio
          icono="sell"
          titulo="Todavía no hay marcas"
          detalle="Agrega la primera arriba. Cada una puede tener su tabla de tallas."
        />
      } @else {
        <ol class="grid gap-3">
          @for (marca of lista(); track marca.id) {
            <li class="rounded-xl border border-border bg-card p-4">
              @if (editando() === marca.id) {
                <form class="grid gap-4" (ngSubmit)="guardar(marca)">
                  <app-campo etiqueta="Nombre" [obligatorio]="true">
                    <input
                      appCampoControl
                      [id]="'editar-marca-' + marca.id"
                      name="nombre"
                      class="campo"
                      [maxlength]="LARGO_DEL_NOMBRE"
                      [(ngModel)]="borrador"
                    />
                  </app-campo>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      class="boton boton-primario boton-chico"
                      [disabled]="enviando()"
                      [attr.aria-busy]="enCurso() === 'guardar-' + marca.id"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      class="boton boton-texto boton-chico"
                      (click)="cerrarEdicion(marca.id)"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              } @else {
                <h3 class="font-semibold">{{ marca.nombre }}</h3>

                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    [id]="'editar-' + marca.id"
                    class="boton boton-secundario boton-chico"
                    (click)="abrirEdicion(marca)"
                  >
                    Editar
                    <span class="sr-only">«{{ marca.nombre }}»</span>
                  </button>
                  <button
                    type="button"
                    class="boton boton-texto boton-chico"
                    [attr.aria-expanded]="conTabla() === marca.id"
                    [attr.aria-controls]="'tallas-' + marca.id"
                    (click)="alternarTabla(marca.id)"
                  >
                    Tabla de tallas
                    <span class="sr-only">de «{{ marca.nombre }}»</span>
                  </button>
                </div>
              }

              @if (origen() === marca.id) {
                @if (error(); as falla) {
                  <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
                } @else if (aviso(); as texto) {
                  <app-aviso variante="exito" class="mt-3 block">{{ texto }}</app-aviso>
                }
              }

              @if (conTabla() === marca.id) {
                <app-tabla-de-tallas [id]="'tallas-' + marca.id" [marca]="marca" />
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class MarcasPanel {
  private readonly api = inject(CatalogoDeLaTienda);
  private readonly injector = inject(Injector);

  protected readonly LARGO_DEL_NOMBRE = LARGO_DEL_NOMBRE;

  protected nueva = '';
  /** El nombre en la fila que se está corrigiendo. */
  protected borrador = '';

  protected readonly editando = signal<number | null>(null);
  /** De qué marca está abierta la tabla de tallas. Una a la vez: es una planilla. */
  protected readonly conTabla = signal<number | null>(null);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  /** Qué acción está viajando, para que gire su botón y no todos (T153). */
  protected readonly enCurso = signal<string | null>(null);
  /** De qué fila es el mensaje; nulo si es del formulario de agregar. */
  protected readonly origen = signal<number | null>(null);

  protected readonly marcas = resource({
    loader: () => this.api.listarMarcas(),
  });

  /** `value()` lanza en estado de error. */
  protected lista(): Marca[] {
    return this.marcas.hasValue() ? this.marcas.value() : [];
  }

  protected async agregar(): Promise<void> {
    this.limpiarMensajes(null);

    const nombre = this.nueva.trim();
    if (!nombre) {
      this.error.set('Escribe el nombre de la marca.');
      return;
    }

    await this.contra('agregar', async () => {
      await this.api.crearMarca(nombre);
      this.aviso.set(`«${nombre}» quedó en la lista.`);
      this.nueva = '';
    }, 'No se pudo agregar la marca.');
  }

  protected abrirEdicion(marca: Marca): void {
    this.limpiarMensajes(marca.id);
    this.borrador = marca.nombre;
    this.editando.set(marca.id);
    this.enfocar(`editar-marca-${marca.id}`);
  }

  protected cerrarEdicion(id: number): void {
    if (this.editando() !== id) return;

    this.editando.set(null);
    this.enfocar(`editar-${id}`);
  }

  protected async guardar(marca: Marca): Promise<void> {
    this.limpiarMensajes(marca.id);

    const nombre = this.borrador.trim();
    if (!nombre) {
      this.error.set('Escribe el nombre de la marca.');
      return;
    }

    await this.contra(`guardar-${marca.id}`, async () => {
      await this.api.editarMarca(marca.id, nombre);
      this.aviso.set('Marca guardada.');
      this.cerrarEdicion(marca.id);
    }, 'No se pudo guardar la marca.');
  }

  protected alternarTabla(id: number): void {
    this.conTabla.update((abierta) => (abierta === id ? null : id));
  }

  /** Recarga siempre, incluso al fallar, como en las categorías. */
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
      this.marcas.reload();
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
