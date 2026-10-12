import { Component, inject, input, output, signal } from '@angular/core';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { FotoDelProducto, ProductosDeLaTienda } from './productos.service';

/**
 * Las fotos de un producto (T159): se suben de a varias, se reordenan y se quitan.
 *
 * **La primera es la portada** del catálogo. Se suben una tras otra y no todas a la vez:
 * son fotos de celular de varios megas, y una que falla dice su nombre sin frenar a las
 * demás.
 */
@Component({
  selector: 'app-fotos-del-producto',
  imports: [Aviso],
  template: `
    <section aria-labelledby="titulo-fotos" class="mt-8">
      <h3 id="titulo-fotos" class="rotulo-seccion">Fotos</h3>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        La primera es la portada del catálogo. Al subirlas se les quitan los datos de
        ubicación que guarda el celular.
      </p>

      @if (fotos().length === 0) {
        <p class="mt-4 text-sm">
          Todavía no tiene fotos: el catálogo lo va a mostrar sin imagen.
        </p>
      } @else {
        <ol class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          @for (foto of fotos(); track foto.id; let primera = $first; let ultima = $last; let i = $index) {
            <li class="rounded-xl border border-border bg-card p-2">
              <img
                [src]="foto.miniatura"
                [alt]="nombre() + ', foto ' + (i + 1)"
                class="aspect-square w-full rounded-lg object-cover"
                loading="lazy"
              />
              @if (primera) {
                <p class="mt-2 text-xs font-bold tracking-wide uppercase text-primary">Portada</p>
              }
              <div class="mt-2 flex flex-wrap gap-1">
                @if (!primera) {
                  <button
                    type="button"
                    class="boton boton-texto boton-chico"
                    [disabled]="trabajando()"
                    [attr.aria-busy]="enCurso() === 'antes-' + foto.id"
                    (click)="mover(i, -1)"
                  >
                    Antes
                    <span class="sr-only">(foto {{ i + 1 }})</span>
                  </button>
                }
                @if (!ultima) {
                  <button
                    type="button"
                    class="boton boton-texto boton-chico"
                    [disabled]="trabajando()"
                    [attr.aria-busy]="enCurso() === 'despues-' + foto.id"
                    (click)="mover(i, 1)"
                  >
                    Después
                    <span class="sr-only">(foto {{ i + 1 }})</span>
                  </button>
                }
                <button
                  type="button"
                  class="boton boton-texto boton-chico"
                  [disabled]="trabajando()"
                  [attr.aria-busy]="enCurso() === 'quitar-' + foto.id"
                  (click)="quitar(foto)"
                >
                  Quitar
                  <span class="sr-only">(foto {{ i + 1 }})</span>
                </button>
              </div>
            </li>
          }
        </ol>
      }

      <label class="mt-4 grid max-w-md gap-1 text-sm">
        <span class="font-medium">Agregar fotos</span>
        <input
          class="campo"
          type="file"
          accept="image/jpeg,image/png"
          multiple
          [disabled]="trabajando()"
          (change)="subir($event)"
        />
      </label>
      @if (progreso(); as texto) {
        <p class="mt-2 text-sm text-muted-foreground" role="status">{{ texto }}</p>
      }

      @for (falla of errores(); track falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </section>
  `,
})
export class FotosDelProducto {
  private readonly api = inject(ProductosDeLaTienda);

  readonly productoId = input.required<number>();
  /** Para el texto alternativo: "Babolat Pure Drive, foto 2". */
  readonly nombre = input.required<string>();
  readonly fotos = input.required<FotoDelProducto[]>();
  /** Para que la ficha vuelva a pedir el producto con sus fotos nuevas. */
  readonly cambiaron = output<void>();

  protected readonly trabajando = signal(false);
  protected readonly enCurso = signal<string | null>(null);
  protected readonly progreso = signal<string | null>(null);
  protected readonly errores = signal<string[]>([]);

  protected async subir(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivos = Array.from(entrada.files ?? []);
    if (archivos.length === 0) return;

    this.errores.set([]);
    this.trabajando.set(true);

    for (const [i, archivo] of archivos.entries()) {
      this.progreso.set(`Subiendo ${i + 1} de ${archivos.length}…`);
      try {
        await this.api.subirFoto(this.productoId(), archivo);
      } catch (falla) {
        const motivo = mensajeDelServidor(falla, 'No se pudo subir.');
        this.errores.update((errores) => [...errores, `${archivo.name}: ${motivo}`]);
      }
    }

    this.progreso.set(null);
    this.trabajando.set(false);
    // Vacío, para que elegir los mismos archivos otra vez vuelva a disparar el cambio.
    entrada.value = '';
    this.cambiaron.emit();
  }

  /** Una posición antes (−1) o después (+1). Se manda el orden entero, como pide la API. */
  protected async mover(indice: number, paso: -1 | 1): Promise<void> {
    const ids = this.fotos().map((foto) => foto.id);
    const clave = `${paso < 0 ? 'antes' : 'despues'}-${ids[indice]}`;
    [ids[indice], ids[indice + paso]] = [ids[indice + paso], ids[indice]];

    await this.contra(clave, () => this.api.ordenarFotos(this.productoId(), ids));
  }

  protected async quitar(foto: FotoDelProducto): Promise<void> {
    await this.contra(`quitar-${foto.id}`, () =>
      this.api.quitarFoto(this.productoId(), foto.id),
    );
  }

  private async contra(clave: string, accion: () => Promise<unknown>): Promise<void> {
    this.errores.set([]);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.cambiaron.emit();
    } catch (falla) {
      this.errores.set([mensajeDelServidor(falla, 'No se pudo guardar el cambio.')]);
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}
