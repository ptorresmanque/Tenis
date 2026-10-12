import { Component, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { CatalogoDeLaTienda, FilaDeTallas, Marca } from './catalogo.service';

/** El ancho de cada talla en `equivalencia_talla` (T156). */
const LARGO_DE_LA_TALLA = 10;

/**
 * La tabla de tallas de una marca, como una planilla corta (T157).
 *
 * **Se guarda entera**, como la reemplaza la API (T156): lo que se manda es exactamente
 * la tabla que el admin ve. Por eso se revisa antes de mandar —sin filas a medio llenar y
 * sin una talla chilena dos veces—, con un mensaje que dice qué fila mirar.
 */
@Component({
  selector: 'app-tabla-de-tallas',
  imports: [FormsModule, Aviso, Esqueleto],
  template: `
    <div class="mt-4 rounded-lg border border-border p-4">
      <h4 class="font-semibold">Tabla de tallas de {{ marca().nombre }}</h4>
      <p class="mt-1 max-w-prose text-sm text-muted-foreground">
        Las variantes de las zapatillas se escriben en talla chilena; la tienda muestra al
        lado la US y la EU de esta tabla.
      </p>

      @if (!tallas.hasValue() && tallas.isLoading()) {
        <app-esqueleto class="mt-3 block" [filas]="3" etiqueta="Cargando la tabla…" />
      } @else if (tallas.error()) {
        <p class="mt-3 text-destructive">
          No se pudo cargar la tabla. Reintenta en un momento.
        </p>
      } @else {
        @if (filas().length === 0) {
          <p class="mt-3 text-sm">
            {{ marca().nombre }} todavía no tiene tabla de tallas. Empieza por la primera
            talla.
          </p>
        } @else {
          <!-- La rejilla de edición del panel, como la de horarios y tarifas. -->
          <table class="tabla tabla-densa mt-3 max-w-md text-sm">
            <thead>
              <tr>
                <th scope="col">CL</th>
                <th scope="col">US</th>
                <th scope="col">EU</th>
                <th scope="col"><span class="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              <!-- Las filas no tienen id hasta guardarse: se siguen por el objeto, que es
                   el mismo mientras la fila exista. Los campos van con poco relleno y
                   centrados: con el de siempre, a 375 px una talla de dos cifras se corta. -->
              @for (fila of filas(); track fila; let i = $index) {
                <tr>
                  <td>
                    <input
                      class="campo px-2 text-center"
                      [attr.aria-label]="'Talla CL, fila ' + (i + 1)"
                      [maxlength]="LARGO_DE_LA_TALLA"
                      [(ngModel)]="fila.tallaCl"
                    />
                  </td>
                  <td>
                    <input
                      class="campo px-2 text-center"
                      [attr.aria-label]="'Talla US, fila ' + (i + 1)"
                      [maxlength]="LARGO_DE_LA_TALLA"
                      [(ngModel)]="fila.tallaUs"
                    />
                  </td>
                  <td>
                    <input
                      class="campo px-2 text-center"
                      [attr.aria-label]="'Talla EU, fila ' + (i + 1)"
                      [maxlength]="LARGO_DE_LA_TALLA"
                      [(ngModel)]="fila.tallaEu"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      class="boton boton-texto boton-chico"
                      (click)="quitar(fila)"
                    >
                      Quitar
                      <span class="sr-only">la talla {{ fila.tallaCl || 'vacía' }}</span>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }

        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="boton boton-secundario boton-chico" (click)="agregar()">
            Agregar una talla
          </button>
          <button
            type="button"
            class="boton boton-primario boton-chico"
            [disabled]="guardando()"
            [attr.aria-busy]="guardando()"
            (click)="guardar()"
          >
            Guardar la tabla
          </button>
        </div>

        @if (error(); as falla) {
          <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
        } @else if (aviso(); as texto) {
          <app-aviso variante="exito" class="mt-3 block">{{ texto }}</app-aviso>
        }
      }
    </div>
  `,
})
export class TablaDeTallas {
  private readonly api = inject(CatalogoDeLaTienda);

  readonly marca = input.required<Marca>();

  protected readonly LARGO_DE_LA_TALLA = LARGO_DE_LA_TALLA;

  protected readonly tallas = resource({
    params: () => this.marca().id,
    loader: ({ params: id }) => this.api.tallas(id),
  });

  /** La copia que se edita: parte de lo guardado y vuelve a partir cada vez que se recarga. */
  protected readonly filas = linkedSignal<FilaDeTallas[]>(() =>
    this.tallas.hasValue() ? this.tallas.value().map((fila) => ({ ...fila })) : [],
  );

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected agregar(): void {
    this.filas.update((filas) => [...filas, { tallaCl: '', tallaUs: '', tallaEu: '' }]);
  }

  protected quitar(fila: FilaDeTallas): void {
    this.filas.update((filas) => filas.filter((otra) => otra !== fila));
  }

  protected async guardar(): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);

    const limpias = this.filas().map((fila) => ({
      tallaCl: fila.tallaCl.trim(),
      tallaUs: fila.tallaUs.trim(),
      tallaEu: fila.tallaEu.trim(),
    }));

    const problema = queRevisar(limpias);
    if (problema) {
      this.error.set(problema);
      return;
    }

    this.guardando.set(true);
    try {
      const guardadas = await this.api.guardarTallas(this.marca().id, limpias);
      this.filas.set(guardadas.map((fila) => ({ ...fila })));
      const n = guardadas.length;
      this.aviso.set(
        `Tabla de ${this.marca().nombre} guardada: ${n} ${n === 1 ? 'talla' : 'tallas'}.`,
      );
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar la tabla.'));
    } finally {
      this.guardando.set(false);
    }
  }
}

/**
 * Lo mismo que rechaza la API (T156), dicho antes de mandar y con la fila: el servidor
 * nombra la talla repetida, pero no puede decir cuál de las veinte filas quedó a medias.
 */
function queRevisar(filas: FilaDeTallas[]): string | null {
  const incompleta = filas.findIndex((f) => !f.tallaCl || !f.tallaUs || !f.tallaEu);
  if (incompleta >= 0) return `Completa las tres tallas de la fila ${incompleta + 1}.`;

  const vistas = new Set<string>();
  for (const { tallaCl } of filas) {
    // Sin distinguir mayúsculas, como el único de la base.
    const clave = tallaCl.toLowerCase();
    if (vistas.has(clave)) return `La talla CL ${tallaCl} está dos veces en la tabla.`;
    vistas.add(clave);
  }

  return null;
}
