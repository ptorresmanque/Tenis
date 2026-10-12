import { Component, inject, input, output, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { OpcionSelector, Selector } from '../../ui/selector';
import {
  MotivoDeMovimiento,
  MovimientoDeStock,
  ProductosDeLaTienda,
} from './productos.service';

/** El ancho de `nota` en `movimiento_stock` (T158). */
const LARGO_DE_LA_NOTA = 300;

const TIPOS: OpcionSelector[] = [
  { valor: 'ENTRADA', etiqueta: 'Entrada' },
  { valor: 'AJUSTE', etiqueta: 'Ajuste' },
];

const MOTIVOS: Record<MotivoDeMovimiento, string> = {
  ENTRADA: 'Entrada',
  VENTA: 'Venta',
  AJUSTE: 'Ajuste',
  DEVOLUCION: 'Devolución',
  ANULACION: 'Anulación',
};

/**
 * Fecha y hora del club, como las lee el admin: "12-10-2026, 18:00". En 24 horas, como
 * todo el sitio: `es-CL` sin `hourCycle` las da en 12, con "p. m.".
 */
const FECHA_Y_HORA = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Santiago',
});

/**
 * El stock de una variante (T160): su historial, y registrar una entrada de mercadería o un
 * ajuste.
 *
 * **Un ajuste lleva nota**, y se exige antes de mandarlo: seis meses después, un −3 sin
 * explicación no se distingue de un robo. Las ventas y las devoluciones no se registran
 * acá: llegan solas, y aparecen en la lista con su motivo.
 */
@Component({
  selector: 'app-movimientos-de-la-variante',
  imports: [FormsModule, Aviso, Esqueleto, Selector],
  template: `
    <div class="mt-4 rounded-lg border border-border p-4">
      @if (!historial.hasValue() && historial.isLoading()) {
        <app-esqueleto class="block" [filas]="4" etiqueta="Cargando los movimientos…" />
      } @else if (historial.error()) {
        <p class="text-destructive">
          No se pudieron cargar los movimientos. Reintenta en un momento.
        </p>
      } @else if (historial.value(); as datos) {
        <h4 class="font-semibold">
          {{ datos.variante.producto }} · {{ datos.variante.etiqueta }}
        </h4>
        <p class="mt-1 text-sm">
          Stock actual: <strong [class.text-destructive]="datos.variante.stock < 0">{{ datos.variante.stock }}</strong>
        </p>

        <form class="mt-4 grid max-w-xl gap-3" (ngSubmit)="registrar()">
          <app-selector
            etiqueta="Qué registrar"
            [opciones]="TIPOS"
            [valor]="tipo()"
            (valorChange)="tipo.set($event === 'AJUSTE' ? 'AJUSTE' : 'ENTRADA')"
          />
          <label class="grid gap-1 text-sm">
            <span class="font-medium">
              {{ tipo() === 'ENTRADA' ? 'Cuánto entra' : 'Cuánto sobra (+) o falta (−)' }}
            </span>
            <input
              class="campo max-w-40"
              name="cantidad"
              type="number"
              step="1"
              inputmode="numeric"
              [(ngModel)]="cantidad"
            />
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium">
              Nota{{ tipo() === 'AJUSTE' ? ' *' : ' (opcional)' }}
            </span>
            <textarea
              class="campo"
              name="nota"
              rows="2"
              [maxlength]="LARGO_DE_LA_NOTA"
              [placeholder]="tipo() === 'AJUSTE' ? 'Un conteo, una merma, un producto fallado' : 'La guía del proveedor, por ejemplo'"
              [(ngModel)]="nota"
            ></textarea>
          </label>
          <div>
            <button
              type="submit"
              class="boton boton-secundario boton-chico"
              [disabled]="enviando()"
              [attr.aria-busy]="enviando()"
            >
              {{ tipo() === 'ENTRADA' ? 'Registrar la entrada' : 'Registrar el ajuste' }}
            </button>
          </div>
        </form>

        @if (error(); as falla) {
          <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
        }

        @if (datos.movimientos.length === 0) {
          <p class="mt-4 text-sm text-muted-foreground">Sin movimientos todavía.</p>
        } @else {
          <div class="mt-4 overflow-x-auto">
            <table class="tabla tabla-densa text-sm">
              <caption class="sr-only">Movimientos de stock, del más nuevo al más viejo</caption>
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Qué</th>
                  <th scope="col" class="numero">Cuánto</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Nota</th>
                </tr>
              </thead>
              <tbody>
                @for (movimiento of datos.movimientos; track movimiento.id) {
                  <tr>
                    <td class="whitespace-nowrap">{{ cuando(movimiento) }}</td>
                    <td>{{ MOTIVOS[movimiento.motivo] }}</td>
                    <td class="numero" [class.text-destructive]="movimiento.cantidad < 0">
                      {{ conSigno(movimiento.cantidad) }}
                    </td>
                    <td>{{ quien(movimiento) }}</td>
                    <td class="text-muted-foreground">{{ movimiento.nota ?? '' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>
  `,
})
export class MovimientosDeLaVariante {
  private readonly api = inject(ProductosDeLaTienda);

  readonly varianteId = input.required<number>();
  /** Para que la ficha vuelva a pedir el producto: cambió el stock de una variante. */
  readonly cambiaron = output<void>();

  protected readonly TIPOS = TIPOS;
  protected readonly MOTIVOS = MOTIVOS;
  protected readonly LARGO_DE_LA_NOTA = LARGO_DE_LA_NOTA;

  protected readonly tipo = signal<'ENTRADA' | 'AJUSTE'>('ENTRADA');
  protected cantidad: number | null = null;
  protected nota = '';

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly historial = resource({
    params: () => this.varianteId(),
    loader: ({ params: id }) => this.api.movimientos(id),
  });

  protected async registrar(): Promise<void> {
    const motivo = this.tipo();
    const cantidad = this.cantidad;
    const nota = this.nota.trim();

    this.error.set(null);
    if (motivo === 'ENTRADA' && (cantidad === null || !Number.isInteger(cantidad) || cantidad < 1)) {
      this.error.set('Lo que entra es un número entero mayor que cero.');
      return;
    }
    if (motivo === 'AJUSTE' && (cantidad === null || !Number.isInteger(cantidad) || cantidad === 0)) {
      this.error.set('Escribe cuánto sobra (positivo) o cuánto falta (negativo).');
      return;
    }
    if (motivo === 'AJUSTE' && !nota) {
      this.error.set('Un ajuste lleva una nota que diga por qué: un conteo, una merma.');
      return;
    }

    this.enviando.set(true);
    try {
      await this.api.registrarMovimiento(this.varianteId(), {
        motivo,
        cantidad: cantidad!,
        nota: nota || null,
      });
      this.cantidad = null;
      this.nota = '';
      this.historial.reload();
      this.cambiaron.emit();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo registrar el movimiento.'));
    } finally {
      this.enviando.set(false);
    }
  }

  protected cuando(movimiento: MovimientoDeStock): string {
    return FECHA_Y_HORA.format(new Date(movimiento.creadoEn));
  }

  /** "+7" y "−2": el signo menos tipográfico se distingue mejor de un guion. */
  protected conSigno(cantidad: number): string {
    return cantidad > 0 ? `+${cantidad}` : `−${Math.abs(cantidad)}`;
  }

  protected quien(movimiento: MovimientoDeStock): string {
    if (movimiento.quien) return movimiento.quien;

    return movimiento.motivo === 'VENTA' ? 'Compra en línea' : '—';
  }
}
