import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Insignia } from '../../ui/insignia';
import { ProductosDeLaTienda, VarianteDelProducto } from './productos.service';

/** Los anchos de `variante` en la base (T158). */
const LARGO_DE_LA_ETIQUETA = 40;
const LARGO_DEL_CODIGO = 64;

/**
 * Las variantes de un producto (T159): agregarlas y corregirlas.
 *
 * **El stock se ve pero no se edita**: el de una variante nueva entra como una entrada con
 * su autor, y después cambia con una entrada o un ajuste (T160). El campo del código acepta
 * el lector de barras, que escribe el código y un Enter: ese Enter pasa al stock en vez de
 * agregar la variante a medio llenar.
 */
@Component({
  selector: 'app-variantes-del-producto',
  imports: [FormsModule, Aviso, Insignia],
  template: `
    <section aria-labelledby="titulo-variantes" class="mt-8">
      <h3 id="titulo-variantes" class="rotulo-seccion">Variantes</h3>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Una talla, un color, un grip. En zapatillas, la etiqueta es la talla chilena. El
        stock se cambia con una entrada de mercadería o un ajuste, no acá.
      </p>

      @if (variantes().length > 0) {
        <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table class="tabla">
            <caption class="sr-only">Variantes del producto</caption>
            <thead>
              <tr>
                <th scope="col">Etiqueta</th>
                <th scope="col">Código de barras</th>
                <th scope="col" class="numero">Stock</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (variante of variantes(); track variante.id) {
                <tr>
                  @if (editando() === variante.id) {
                    <td>
                      <label class="grid gap-1 text-sm">
                        <span class="font-medium">Etiqueta</span>
                        <input
                          class="campo"
                          [maxlength]="LARGO_DE_LA_ETIQUETA"
                          [(ngModel)]="borrador.etiqueta"
                        />
                      </label>
                    </td>
                    <td>
                      <label class="grid gap-1 text-sm">
                        <span class="font-medium">Código de barras</span>
                        <input
                          class="campo font-mono"
                          [maxlength]="LARGO_DEL_CODIGO"
                          [(ngModel)]="borrador.codigoBarras"
                          (keydown.enter)="$event.preventDefault()"
                        />
                      </label>
                    </td>
                    <td class="numero">{{ variante.stock }}</td>
                    <td>
                      <label class="flex items-center gap-2 text-sm">
                        <input type="checkbox" [(ngModel)]="borrador.activa" />
                        Activa
                      </label>
                    </td>
                    <td>
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          class="boton boton-primario boton-chico"
                          [disabled]="enviando()"
                          [attr.aria-busy]="enCurso() === 'guardar-' + variante.id"
                          (click)="guardar(variante)"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          class="boton boton-texto boton-chico"
                          (click)="editando.set(null)"
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  } @else {
                    <td class="font-semibold">{{ variante.etiqueta }}</td>
                    <td class="font-mono text-sm">{{ variante.codigoBarras ?? '—' }}</td>
                    <td class="numero" [class.text-destructive]="variante.stock < 0">
                      {{ variante.stock }}
                    </td>
                    <td>
                      @if (variante.activa) {
                        <app-insignia variante="exito">Activa</app-insignia>
                      } @else {
                        <app-insignia variante="neutro" icono="pause_circle">Inactiva</app-insignia>
                      }
                    </td>
                    <td>
                      <button
                        type="button"
                        class="boton boton-secundario boton-chico"
                        (click)="abrirEdicion(variante)"
                      >
                        Editar
                        <span class="sr-only">la variante {{ variante.etiqueta }}</span>
                      </button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="mt-4 text-sm">
          Todavía no tiene variantes. Sin ellas no se puede publicar: agrega la primera abajo.
        </p>
      }

      <form class="mt-4 grid max-w-2xl gap-4 sm:grid-cols-3" (ngSubmit)="agregar()">
        <label class="grid gap-1 text-sm">
          <span class="font-medium">Etiqueta *</span>
          <input
            class="campo"
            name="etiqueta"
            placeholder="40, Grip 2, Negro / M"
            [maxlength]="LARGO_DE_LA_ETIQUETA"
            [(ngModel)]="nueva.etiqueta"
          />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-medium">Código de barras</span>
          <input
            class="campo font-mono"
            name="codigoBarras"
            autocomplete="off"
            [maxlength]="LARGO_DEL_CODIGO"
            [(ngModel)]="nueva.codigoBarras"
            (keydown.enter)="$event.preventDefault(); stockInicial.focus()"
          />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-medium">Stock inicial</span>
          <input
            #stockInicial
            class="campo"
            name="stock"
            type="number"
            min="0"
            inputmode="numeric"
            [(ngModel)]="nueva.stock"
          />
        </label>
        <div class="sm:col-span-3">
          <button
            type="submit"
            class="boton boton-secundario"
            [disabled]="enviando()"
            [attr.aria-busy]="enCurso() === 'agregar'"
          >
            Agregar la variante
          </button>
        </div>
      </form>

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </section>
  `,
})
export class VariantesDelProducto {
  private readonly api = inject(ProductosDeLaTienda);

  readonly productoId = input.required<number>();
  readonly variantes = input.required<VarianteDelProducto[]>();
  /** Para que la ficha vuelva a pedir el producto: cambió algo de sus variantes. */
  readonly cambiaron = output<void>();

  protected readonly LARGO_DE_LA_ETIQUETA = LARGO_DE_LA_ETIQUETA;
  protected readonly LARGO_DEL_CODIGO = LARGO_DEL_CODIGO;

  protected nueva = enBlanco();
  protected borrador = { etiqueta: '', codigoBarras: '', activa: true };

  protected readonly editando = signal<number | null>(null);
  protected readonly enviando = signal(false);
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async agregar(): Promise<void> {
    const etiqueta = this.nueva.etiqueta.trim();
    const stock = Number(this.nueva.stock || 0);

    this.error.set(null);
    if (!etiqueta) {
      this.error.set('Escribe la etiqueta de la variante.');
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      this.error.set('El stock inicial es un número entero desde 0.');
      return;
    }

    await this.contra('agregar', async () => {
      await this.api.agregarVariante(this.productoId(), {
        etiqueta,
        codigoBarras: this.nueva.codigoBarras.trim() || null,
        stock,
      });
      this.nueva = enBlanco();
    }, 'No se pudo agregar la variante.');
  }

  protected abrirEdicion(variante: VarianteDelProducto): void {
    this.error.set(null);
    this.borrador = {
      etiqueta: variante.etiqueta,
      codigoBarras: variante.codigoBarras ?? '',
      activa: variante.activa,
    };
    this.editando.set(variante.id);
  }

  protected async guardar(variante: VarianteDelProducto): Promise<void> {
    const etiqueta = this.borrador.etiqueta.trim();

    this.error.set(null);
    if (!etiqueta) {
      this.error.set('Escribe la etiqueta de la variante.');
      return;
    }

    await this.contra(`guardar-${variante.id}`, async () => {
      await this.api.editarVariante(variante.id, {
        etiqueta,
        codigoBarras: this.borrador.codigoBarras.trim() || null,
        activa: this.borrador.activa,
      });
      this.editando.set(null);
    }, 'No se pudo guardar la variante.');
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
      this.cambiaron.emit();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, porDefecto));
    } finally {
      this.enviando.set(false);
      this.enCurso.set(null);
    }
  }
}

function enBlanco() {
  return { etiqueta: '', codigoBarras: '', stock: '' as number | '' };
}
