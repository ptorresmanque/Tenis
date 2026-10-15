import { Component, computed, inject, input, resource } from '@angular/core';

import { AdminCanchas, AmbitoDeReglas, HorasSinTarifa } from './admin-canchas.service';
import { EditorFranjas } from './editor-franjas';
import { EditorHorarios } from './editor-horarios';
import { Esqueleto } from '../../ui/esqueleto';

/** Cuál de las dos pestañas de Canchas es: la ruta se lo pasa en `data` (T288). */
export type ParteDeLasReglas = 'horario' | 'tarifas';

/** Lo que dice cada pestaña; el editor es lo único que cambia en la plantilla. */
const TEXTOS: Record<ParteDeLasReglas, { descripcion: string; cargando: string; falla: string }> = {
  horario: {
    descripcion:
      'El horario de apertura de todo el club. Rige en toda cancha que no tenga el suyo: ' +
      'lo que una cancha define para sí misma le gana a esto.',
    cargando: 'Cargando el horario…',
    falla: 'No se pudo cargar el horario del club.',
  },
  tarifas: {
    descripcion:
      'Las tarifas de todo el club. Rigen en toda cancha que no tenga las suyas: ' +
      'lo que una cancha define para sí misma le gana a esto.',
    cargando: 'Cargando las tarifas…',
    falla: 'No se pudieron cargar las tarifas del club.',
  },
};

/**
 * El horario y las tarifas que rigen donde la cancha no dice otra cosa.
 *
 * Son las filas con `cancha_id` nulo. El panel las nombraba desde T13 —"vale el
 * general del club", "valen las generales del club"— sin dar dónde cambiarlas.
 *
 * Reusa los mismos editores que cada cancha, pasándoles un ámbito sin id. Dos
 * copias con la misma tabla debajo terminan divergiendo, y la del club, que se
 * toca una vez al año, sería la que envejece.
 *
 * Desde T288 son las pestañas Horario y Tarifas de Canchas: la misma pantalla, con una parte
 * cada una. Lo que se guarda relee la alarma de horas sin tarifa, que va arriba de las pestañas.
 */
@Component({
  selector: 'app-reglas-generales',
  imports: [EditorHorarios, EditorFranjas, Esqueleto],
  template: `
    <p class="max-w-prose text-muted-foreground">{{ textos().descripcion }}</p>

    @if (general.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="4" [etiqueta]="textos().cargando" />
    } @else if (general.error()) {
      <p class="mt-4 text-destructive">{{ textos().falla }} Reintenta en un momento.</p>
    } @else if (club(); as ambito) {
      <div class="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        @if (parte() === 'horario') {
          <app-editor-horarios [ambito]="ambito" (guardado)="recargar()" />
        } @else {
          <app-editor-franjas [ambito]="ambito" (cambiado)="recargar()" />
        }
      </div>
    }
  `,
})
export class ReglasGeneralesPanel {
  private readonly api = inject(AdminCanchas);
  /** Cambiar lo general cambia qué horas quedan sin tarifa en cada cancha. */
  private readonly alarma = inject(HorasSinTarifa);

  readonly parte = input.required<ParteDeLasReglas>();
  protected readonly textos = computed(() => TEXTOS[this.parte()]);

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
    this.alarma.recargar();
  }
}
