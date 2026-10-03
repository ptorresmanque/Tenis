import { Component, computed, inject, output, resource } from '@angular/core';

import { AdminCanchas, AmbitoDeReglas } from './admin-canchas.service';
import { EditorFranjas } from './editor-franjas';
import { EditorHorarios } from './editor-horarios';

/**
 * El horario y las tarifas que rigen donde la cancha no dice otra cosa.
 *
 * Son las filas con `cancha_id` nulo. El panel las nombraba desde T13 —"vale el
 * general del club", "valen las generales del club"— sin dar dónde cambiarlas.
 *
 * Reusa los mismos editores que cada cancha, pasándoles un ámbito sin id. Dos
 * copias con la misma tabla debajo terminan divergiendo, y la del club, que se
 * toca una vez al año, sería la que envejece.
 */
@Component({
  selector: 'app-reglas-generales',
  imports: [EditorHorarios, EditorFranjas],
  template: `
    <section class="mt-8" aria-labelledby="titulo-general">
      <h2 id="titulo-general" class="font-display text-xl font-semibold">
        Horario y tarifas generales
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Rigen en toda cancha que no tenga lo suyo propio. Lo que una cancha define
        para sí misma le gana a esto.
      </p>

      @if (general.isLoading()) {
        <p class="mt-3 text-muted-foreground">Cargando…</p>
      } @else if (general.error()) {
        <p class="mt-3 text-destructive">
          No se pudieron cargar el horario y las tarifas generales. Reintenta en un momento.
        </p>
      } @else if (club(); as ambito) {
        <div class="mt-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 class="text-sm font-semibold">Horario de apertura</h3>
          <app-editor-horarios [ambito]="ambito" (guardado)="recargar()" />

          <h3 class="mt-4 text-sm font-semibold">Tarifas</h3>
          <app-editor-franjas [ambito]="ambito" (cambiado)="recargar()" />
        </div>
      }
    </section>
  `,
})
export class ReglasGeneralesPanel {
  private readonly api = inject(AdminCanchas);

  /** Cambiar lo general cambia qué horas quedan sin tarifa en cada cancha. */
  readonly cambiado = output<void>();

  protected readonly general = resource({
    loader: () => this.api.general(),
  });

  /** El club, con la misma forma que una cancha para los editores. */
  protected readonly club = computed<AmbitoDeReglas | null>(() => {
    const reglas = this.general.value();

    // "todo el club" y no "el club": el nombre se lee dentro de frases como
    // "Horario de apertura de …", que es lo que oye quien usa lector de pantalla.
    return reglas
      ? {
          id: null,
          nombre: 'todo el club',
          horarios: reglas.horarios,
          franjas: reglas.franjas,
        }
      : null;
  });

  protected recargar(): void {
    this.general.reload();
    this.cambiado.emit();
  }
}
