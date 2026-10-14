import { Component, inject, linkedSignal, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';

import { mensajeDelServidor } from '../../core/errores';
import { CampoHora } from '../../ui/campo-hora';
import { Esqueleto } from '../../ui/esqueleto';
import { diaEnPalabras, fechaEnElClub, horaEnElClub } from '../reloj-del-club';
import { AdminCanchas, ExcesoDeLuz } from './admin-canchas.service';

/**
 * El tope de canchas con luz, en Reglas (T208).
 *
 * La instalación eléctrica del club se corta con más de dos canchas encendidas a la vez, y
 * mientras no se arregle el sistema no deja ocupar una más que el tope desde cierta hora.
 * Encenderlo, bajarlo o adelantar su hora no cancela nada: debajo van las horas ya tomadas
 * que lo superan, para que el club llame a esas personas.
 *
 * Componente aparte del formulario de reglas, que trata todos sus campos como números: acá
 * hay una casilla, un número que puede no existir y una hora.
 */
@Component({
  selector: 'app-editor-tope-de-luz',
  imports: [MatButton, FormsModule, CampoHora, Esqueleto],
  template: `
    <section class="mt-8" aria-labelledby="titulo-tope-de-luz">
      <h2 id="titulo-tope-de-luz" class="rotulo-seccion">Tope de canchas con luz</h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        La instalación eléctrica del club no aguanta todas las canchas encendidas a la vez.
        Desde la hora que elijas y hasta el cierre, ninguna reserva, clase ni partido puede
        ocupar más canchas con luz que el tope, y nadie se lo salta. Lo que ya estaba tomado
        no se cancela: abajo están las horas que lo superan.
      </p>

      @if (configuracion.isLoading()) {
        <app-esqueleto class="mt-3 block" [filas]="2" etiqueta="Cargando el tope…" />
      } @else if (configuracion.error()) {
        <p class="mt-3 text-destructive">
          No se pudo cargar el tope. Reintenta en un momento.
        </p>
      } @else {
        <form class="mt-3" (ngSubmit)="guardar()">
          <label class="flex items-center gap-2 py-2 text-sm">
            <input
              type="checkbox"
              name="limitarLuz"
              [ngModel]="limitar()"
              (ngModelChange)="limitar.set($event)"
            />
            Limitar las canchas con luz encendida
          </label>

          @if (limitar()) {
            <div class="mt-2 flex flex-wrap items-end gap-4">
              <div>
                <label for="tope-de-luz-canchas" class="block text-sm font-medium">
                  Canchas a la vez
                </label>
                <input
                  id="tope-de-luz-canchas"
                  name="topeCanchasConLuz"
                  type="number"
                  min="1"
                  class="campo mt-1 w-24"
                  [ngModel]="canchas()"
                  (ngModelChange)="canchas.set($event)"
                />
              </div>
              <div>
                <label for="tope-de-luz-desde" class="block text-sm font-medium">
                  Desde las
                </label>
                <app-campo-hora
                  class="mt-1"
                  inputId="tope-de-luz-desde"
                  name="topeCanchasConLuzDesde"
                  claseCampo="w-24"
                  [ngModel]="desde()"
                  (ngModelChange)="desde.set($event)"
                />
              </div>
            </div>
          }

          <button
            matButton="filled"
            type="submit"
            [disabled]="guardando()"
            [attr.aria-busy]="guardando()"
            class="mt-4"
          >
            Guardar el tope
          </button>

          <p role="status" aria-live="polite" class="mt-2 text-sm">
            @if (error()) {
              <span class="text-destructive">{{ error() }}</span>
            } @else if (aviso()) {
              <span class="text-accent-strong">{{ aviso() }}</span>
            }
          </p>
        </form>
      }

      <h3 class="mt-6 text-base font-semibold">Horas tomadas que superan el tope</h3>
      @if (excesos.isLoading()) {
        <app-esqueleto class="mt-2 block" [filas]="2" etiqueta="Buscando horas por encima del tope…" />
      } @else if (excesos.error()) {
        <p class="mt-2 text-destructive">
          No se pudo revisar si alguna hora supera el tope. Reintenta en un momento.
        </p>
      } @else if (excesos.value().length === 0) {
        <p class="mt-2 text-sm text-muted-foreground">Ninguna hora tomada supera el tope.</p>
      } @else {
        <ul class="mt-2 grid gap-3">
          @for (exceso of excesos.value(); track exceso.desde) {
            <li>
              <p class="text-sm font-medium">{{ cuando(exceso) }}</p>
              <ul class="mt-1 text-sm text-muted-foreground">
                @for (ocupacion of exceso.ocupaciones; track $index) {
                  <li>{{ ocupacion.cancha }}: {{ ocupacion.detalle }}</li>
                }
              </ul>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class EditorTopeDeLuz {
  private readonly api = inject(AdminCanchas);

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly configuracion = resource({
    loader: () => this.api.configuracion(),
  });

  protected readonly excesos = resource({
    loader: () => this.api.excesosDeLuz(),
    defaultValue: [],
  });

  /** Lo que hay en el formulario, sembrado con lo que dice el servidor. */
  protected readonly limitar = linkedSignal(
    () => this.configuracion.value()?.topeCanchasConLuz !== null,
  );
  protected readonly canchas = linkedSignal<number | null>(
    () => this.configuracion.value()?.topeCanchasConLuz ?? 2,
  );
  protected readonly desde = linkedSignal(
    () => this.configuracion.value()?.topeCanchasConLuzDesde ?? '19:00',
  );

  protected cuando(exceso: ExcesoDeLuz): string {
    return (
      `${diaEnPalabras(fechaEnElClub(exceso.desde))}, ` +
      `de ${horaEnElClub(exceso.desde)} a ${horaEnElClub(exceso.hasta)}`
    );
  }

  protected async guardar(): Promise<void> {
    const canchas = this.canchas();

    // Se ataja acá: un número vacío viajaría como nulo, que para el servidor es apagar el
    // tope, y el admin que solo borró el campo no quiso eso.
    if (this.limitar() && !(Number.isInteger(canchas) && (canchas ?? 0) >= 1)) {
      this.aviso.set(null);
      this.error.set('El tope tiene que ser de 1 cancha o más.');
      return;
    }

    this.error.set(null);
    this.aviso.set(null);
    this.guardando.set(true);

    try {
      await this.api.fijarConfiguracion({
        topeCanchasConLuz: this.limitar() ? canchas : null,
        topeCanchasConLuzDesde: this.desde(),
      });
      this.aviso.set('Guardado. El tope rige desde la próxima reserva.');
      this.configuracion.reload();
      this.excesos.reload();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    } finally {
      this.guardando.set(false);
    }
  }
}
