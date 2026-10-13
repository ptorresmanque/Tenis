import { Component, inject, linkedSignal, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import { Esqueleto } from '../../ui/esqueleto';
import { Selector } from '../../ui/selector';
import { AdminCanchas, DuracionesSocioPico } from './admin-canchas.service';

/**
 * Qué duraciones toma el socio en horario prime (T213, `SPEC-reservas.md` § Duración del
 * socio en horario prime).
 *
 * Tres opciones y siempre una elegida: con dos casillas se podían apagar las dos, y un socio
 * que no puede reservar nada en prime es una regla que nadie pidió. Componente aparte del
 * formulario de reglas, que trata todos sus campos como números.
 */
@Component({
  selector: 'app-editor-prime',
  imports: [FormsModule, Esqueleto, Selector],
  template: `
    <section class="mt-8" aria-labelledby="titulo-prime">
      <h2 id="titulo-prime" class="rotulo-seccion">Duración del socio en horario prime</h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Lo que puede tomar un socio cuando su reserva toca el horario prime, aunque sea en
        parte. Los visitantes siguen con lo que vende cada franja.
      </p>

      @if (configuracion.isLoading()) {
        <app-esqueleto class="mt-3 block" [filas]="1" etiqueta="Cargando la regla…" />
      } @else if (configuracion.error()) {
        <p class="mt-3 text-destructive">
          No se pudo cargar la regla. Reintenta en un momento.
        </p>
      } @else {
        <form class="mt-3" (ngSubmit)="guardar()">
          <app-selector
            etiqueta="En horario prime, el socio reserva"
            [opciones]="OPCIONES"
            [valor]="elegida()"
            (valorChange)="elegir($event)"
          />

          <button
            type="submit"
            [disabled]="guardando()"
            [attr.aria-busy]="guardando()"
            class="boton boton-primario mt-4"
          >
            Guardar la duración
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
    </section>
  `,
})
export class EditorPrime {
  private readonly api = inject(AdminCanchas);

  protected readonly OPCIONES: { valor: DuracionesSocioPico; etiqueta: string }[] = [
    { valor: 'UNA_HORA', etiqueta: 'Solo 1 hora' },
    { valor: 'HORA_Y_MEDIA', etiqueta: 'Solo 1 hora y media' },
    { valor: 'AMBAS', etiqueta: 'Las dos' },
  ];

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly configuracion = resource({
    loader: () => this.api.configuracion(),
  });

  /** Sembrada con lo que dice el servidor; la de partida del club es solo 1 hora. */
  protected readonly elegida = linkedSignal<DuracionesSocioPico>(
    () => this.configuracion.value()?.duracionesSocioPico ?? 'UNA_HORA',
  );

  protected elegir(valor: string): void {
    const opcion = this.OPCIONES.find((una) => una.valor === valor);
    if (opcion) this.elegida.set(opcion.valor);
  }

  protected async guardar(): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.guardando.set(true);

    try {
      await this.api.fijarConfiguracion({ duracionesSocioPico: this.elegida() });
      this.aviso.set('Guardado. Rige desde la próxima reserva.');
      this.configuracion.reload();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    } finally {
      this.guardando.set(false);
    }
  }
}
