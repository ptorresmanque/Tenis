import { Component, inject, linkedSignal, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { ConfiguracionDeLaTienda, ConfiguracionDeLaTiendaApi } from './configuracion.service';

/**
 * La configuración de la tienda, en su pestaña del panel (T172, `SPEC-tienda.md` § Panel):
 * el descuento de socio, el umbral de stock bajo y el texto del arriendo de raquetas. La
 * API valida los rangos —el descuento hasta 50%, el umbral hasta 100— y su mensaje se
 * muestra tal cual.
 */
@Component({
  selector: 'app-configuracion-de-la-tienda',
  imports: [FormsModule, Aviso, Esqueleto],
  template: `
    <section aria-labelledby="titulo-configuracion-tienda">
      <h2 id="titulo-configuracion-tienda" class="rotulo-seccion">Configuración</h2>

      @if (configuracion.isLoading() && !configuracion.hasValue()) {
        <app-esqueleto class="mt-4 block" [filas]="3" etiqueta="Cargando la configuración…" />
      } @else if (configuracion.error()) {
        <p class="mt-4 text-destructive">
          No se pudo cargar la configuración. Reintenta en un momento.
        </p>
      } @else {
        <form class="mt-4 grid max-w-2xl gap-5" (ngSubmit)="guardar()">
          <label class="grid max-w-xs gap-1 text-sm">
            <span class="font-medium">Descuento de socio (%)</span>
            <input
              class="campo"
              name="descuentoSocioPorcentaje"
              type="number"
              min="0"
              max="50"
              step="1"
              inputmode="numeric"
              [(ngModel)]="formulario().descuentoSocioPorcentaje"
            />
            <span class="text-xs text-muted-foreground">
              Para el socio activo y al día, de 0 a 50. Cambia el precio de lo que se venda desde
              ahora; lo ya vendido conserva el suyo.
            </span>
          </label>

          <label class="grid max-w-xs gap-1 text-sm">
            <span class="font-medium">Umbral de stock bajo</span>
            <input
              class="campo"
              name="umbralStockBajo"
              type="number"
              min="0"
              max="100"
              step="1"
              inputmode="numeric"
              [(ngModel)]="formulario().umbralStockBajo"
            />
            <span class="text-xs text-muted-foreground">
              Una variante con este stock o menos sale como "stock bajo" en los productos.
            </span>
          </label>

          <label class="grid gap-1 text-sm">
            <span class="font-medium">Arriendo de raquetas</span>
            <textarea
              class="campo"
              name="arriendoRaquetasTexto"
              rows="3"
              maxlength="600"
              [(ngModel)]="formulario().arriendoRaquetasTexto"
            ></textarea>
            <span class="text-xs text-muted-foreground">
              Se muestra en la tienda en línea. Vacío, no aparece.
            </span>
          </label>

          @if (guardado()) {
            <app-aviso variante="exito">Guardado.</app-aviso>
          }
          @if (error(); as falla) {
            <app-aviso variante="error">{{ falla }}</app-aviso>
          }

          <div>
            <button
              type="submit"
              class="boton boton-primario"
              [disabled]="guardando()"
              [attr.aria-busy]="guardando()"
            >
              Guardar
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class ConfiguracionDeLaTiendaPanel {
  private readonly api = inject(ConfiguracionDeLaTiendaApi);

  protected readonly configuracion = resource({ loader: () => this.api.leer() });

  /** Lo que se edita: lo cargado, copiado para no tocar el valor del recurso. */
  protected readonly formulario = linkedSignal<ConfiguracionDeLaTienda>(() =>
    this.configuracion.hasValue()
      ? { ...this.configuracion.value() }
      : { descuentoSocioPorcentaje: 0, umbralStockBajo: 0, arriendoRaquetasTexto: '' },
  );

  protected readonly guardando = signal(false);
  protected readonly guardado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async guardar(): Promise<void> {
    this.guardado.set(false);
    this.error.set(null);
    const { descuentoSocioPorcentaje, umbralStockBajo, arriendoRaquetasTexto } = this.formulario();

    // Un campo numérico vacío llega como null, y `Number(null)` es 0: guardarlo dejaría el
    // descuento en 0% sin que nadie lo decidiera. Se pide escribirlo.
    if (vacio(descuentoSocioPorcentaje)) {
      this.error.set('Escribe el descuento de socio, de 0 a 50. Con 0 no hay descuento.');
      return;
    }
    if (vacio(umbralStockBajo)) {
      this.error.set('Escribe el umbral de stock bajo, de 0 a 100.');
      return;
    }

    this.guardando.set(true);
    try {
      await this.api.guardar({
        descuentoSocioPorcentaje: Number(descuentoSocioPorcentaje),
        umbralStockBajo: Number(umbralStockBajo),
        arriendoRaquetasTexto,
      });
      this.guardado.set(true);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar la configuración.', [400]));
    } finally {
      this.guardando.set(false);
    }
  }
}

function vacio(valor: number | string | null | undefined): boolean {
  return valor === null || valor === undefined || valor === '';
}
