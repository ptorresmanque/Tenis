import { Component, computed, inject, resource, signal } from '@angular/core';

import { BloqueDisponible, Disponibilidad } from '../disponibilidad';
import {
  diaEnPalabras,
  enPesos,
  hoyEnElClub,
  horaEnElClub,
} from '../reloj-del-club';

/**
 * Cómo se nombra cada motivo de bloqueo. El enum de la base no se muestra crudo:
 * "MANTENCION" en pantalla se lee como un error del sistema.
 */
const MOTIVOS: Record<string, string> = {
  MANTENCION: 'En mantención',
  TORNEO: 'Torneo',
  CLASE: 'Clase',
  OTRO: 'No disponible',
};

const SUPERFICIES: Record<string, string> = {
  ARCILLA: 'Arcilla',
  CEMENTO: 'Cemento',
  PASTO_SINTETICO: 'Pasto sintético',
};

@Component({
  selector: 'app-grilla',
  template: `
    <h1 class="font-display text-3xl font-bold">Disponibilidad</h1>

    <div class="mt-4 flex flex-wrap items-end gap-4">
      <div>
        <label for="fecha" class="block text-sm font-medium">Día</label>
        <input
          id="fecha"
          type="date"
          class="mt-1 rounded-lg border border-border bg-card px-3 py-2"
          [value]="fecha()"
          (change)="cambiarFecha($event)"
        />
      </div>

      <p class="text-muted-foreground">{{ diaEnPalabras(fecha()) }}</p>
    </div>

    <!-- Los cambios de estado se anuncian: quien usa lector de pantalla no ve
         que la grilla se repobló. -->
    <div role="status" aria-live="polite" class="mt-6">
      @if (grillas.isLoading()) {
        <p class="text-muted-foreground">Buscando horas disponibles…</p>
      } @else if (grillas.error()) {
        <p class="text-destructive">
          No se pudo cargar la disponibilidad. Reintenta en un momento.
        </p>
      } @else if (grillas.value().length === 0) {
        <p class="text-muted-foreground">El club no tiene canchas publicadas.</p>
      } @else {
        <!-- Que la carga terminó también hay que decirlo: quien usa lector de
             pantalla oyó "buscando" y después se quedaría en silencio, sin saber
             si la grilla se repobló ni con cuánto. -->
        <p class="sr-only">{{ resumen() }}</p>
      }
    </div>

    @for (grilla of grillas.value(); track grilla.cancha.id) {
      <section class="mt-8" [attr.aria-labelledby]="'cancha-' + grilla.cancha.id">
        <h2
          [id]="'cancha-' + grilla.cancha.id"
          class="font-display text-xl font-semibold"
        >
          {{ grilla.cancha.nombre }}
        </h2>
        <p class="text-sm text-muted-foreground">
          {{ superficie(grilla.cancha.superficie) }}
          @if (grilla.cancha.techada) {
            · Techada
          }
          @if (grilla.cancha.iluminacion) {
            · Con iluminación
          }
        </p>

        @if (grilla.bloques.length === 0) {
          <p class="mt-3 text-muted-foreground">
            Esta cancha no abre este día.
          </p>
        } @else {
          <!-- auto-fill con un mínimo de 9rem: a 375px entran dos columnas y a
               partir de ahí las que quepan, sin scroll horizontal en ningún ancho. -->
          <ul
            class="mt-3 grid gap-3 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]"
          >
            @for (bloque of grilla.bloques; track bloque.inicio; let i = $index) {
              <li
                class="bloque rounded-xl border bg-card p-3 shadow-sm"
                [class.border-border]="!bloque.bloqueado"
                [class.border-dashed]="bloque.bloqueado"
                [class.border-muted-foreground]="bloque.bloqueado"
                [class.opacity-70]="bloque.bloqueado"
                [style.--i]="i"
              >
                <p class="font-display text-lg font-semibold">
                  {{ hora(bloque.inicio) }}–{{ hora(bloque.fin) }}
                </p>

                @if (bloque.bloqueado) {
                  <!-- Texto y borde punteado, no solo el color apagado: el par
                       verde/rojo es justo el que no distingue quien tiene
                       daltonismo rojo-verde. -->
                  <p class="mt-1 text-sm font-medium text-muted-foreground">
                    {{ motivo(bloque.motivoBloqueo) }}
                  </p>
                } @else {
                  <p class="mt-1 flex items-center gap-1.5 text-sm font-medium">
                    <span
                      class="size-2 rounded-full bg-accent"
                      aria-hidden="true"
                    ></span>
                    Disponible
                  </p>
                  <p class="mt-1 font-semibold text-accent-strong">
                    {{ pesos(bloque.montoClp) }}
                  </p>
                  @if (bloque.esPico) {
                    <p class="text-xs text-muted-foreground">Hora pico</p>
                  }
                }
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: `
    /* El stagger de MASTER.md § Motion, en CSS puro: sin dependencia y sin JS en
       el hilo principal. Solo opacity y transform. */
    .bloque {
      transition:
        opacity 400ms,
        transform 400ms;
      transition-timing-function: linear(0, 0.6 30%, 1.05 60%, 1);
      /* Topeado en 12: con 60ms por bloque, el número 40 entraría 2,4 s después
         de que la grilla ya está lista. */
      transition-delay: calc(min(var(--i), 12) * 60ms);

      @starting-style {
        opacity: 0;
        transform: translateY(16px) scale(0.92);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bloque {
        transition: none;
        transition-delay: 0ms;
      }
    }
  `,
})
export class Grilla {
  private readonly disponibilidad = inject(Disponibilidad);

  protected readonly fecha = signal(hoyEnElClub());

  protected readonly grillas = resource({
    params: () => ({ fecha: this.fecha() }),
    loader: ({ params }) => this.disponibilidad.delDia(params.fecha),
    // Con valor por defecto, `value()` nunca lanza y el template no necesita
    // preguntar `hasValue()` antes de cada lectura.
    defaultValue: [],
  });

  /** Lo que oye quien no ve la grilla: cuántas horas quedan y en cuántas canchas. */
  protected readonly resumen = computed(() => {
    const grillas = this.grillas.value();
    const libres = grillas.reduce(
      (total, g) => total + g.bloques.filter((b) => !b.bloqueado).length,
      0,
    );

    return `${libres} ${libres === 1 ? 'hora disponible' : 'horas disponibles'} en ${
      grillas.length === 1 ? '1 cancha' : `${grillas.length} canchas`
    }.`;
  });

  protected cambiarFecha(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;

    // El input vacío —se puede borrar con el teclado— no dispara una consulta
    // que la API va a rechazar.
    if (valor) {
      this.fecha.set(valor);
    }
  }

  protected readonly hora = horaEnElClub;
  protected readonly pesos = enPesos;
  protected readonly diaEnPalabras = diaEnPalabras;

  protected motivo(motivo: BloqueDisponible['motivoBloqueo']): string {
    return (motivo && MOTIVOS[motivo]) ?? 'No disponible';
  }

  protected superficie(superficie: string): string {
    return SUPERFICIES[superficie] ?? superficie;
  }
}
