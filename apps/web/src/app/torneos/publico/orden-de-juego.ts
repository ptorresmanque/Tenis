import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';

import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { Insignia, VarianteInsignia } from '../../ui/insignia';
import { PartidoPublico } from '../torneos.service';

/** Un día del torneo, con sus partidos en el orden en que se juegan. */
interface DiaDeJuego {
  fecha: string;
  titulo: string;
  partidos: PartidoPublico[];
}

/**
 * El orden de juego de una categoría (T136): la opción C de la decisión 9 de la sexta
 * parte. **Primero lo que el jugador quiere saber: cuándo y dónde juega.** Los partidos
 * van por día y hora, cada uno con su cancha, ronda, estado y resultado; abajo, los que
 * faltan programar. El buscador marca los de quien se escribe.
 *
 * La búsqueda es un `model()` para que el modal la comparta con el árbol (T137).
 */
@Component({
  selector: 'app-orden-de-juego',
  imports: [Insignia, NgTemplateOutlet],
  template: `
    <div class="relative">
      <label for="buscar-jugador" class="sr-only">Buscar a un jugador</label>
      <span
        class="icono pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg
               text-muted-foreground"
        aria-hidden="true"
      >
        search
      </span>
      <input
        id="buscar-jugador"
        type="search"
        class="campo ps-9"
        placeholder="Busca tu nombre o apellido"
        autocomplete="off"
        [value]="busqueda()"
        (input)="busqueda.set(valorDe($event))"
      />
    </div>
    <!-- Cuántos encontró, para el lector de pantalla; el "nadie" también se ve. -->
    <p class="sr-only" aria-live="polite">{{ resumen() }}</p>
    @if (busqueda().trim() !== '' && encontrados() === 0) {
      <p class="mt-2 text-sm text-muted-foreground">
        Nadie con ese nombre en esta categoría.
      </p>
    }

    @if (porDia().length === 0) {
      <p class="mt-4 text-sm text-muted-foreground">
        El club todavía no programa los partidos: acá van a aparecer por día y hora.
      </p>
    }

    @for (dia of porDia(); track dia.fecha) {
      <h3
        data-dia
        class="mt-4 inline-flex bg-rotulo py-1 ps-3 pe-5 font-display text-sm font-bold
               tracking-wide text-on-rotulo uppercase corte-fin"
      >
        {{ dia.titulo }}
      </h3>
      <ul class="mt-2 grid gap-2">
        @for (partido of dia.partidos; track partido.ronda + '-' + partido.posicion) {
          <li
            data-turno
            [attr.data-tuyo]="esTuyo(partido) ? '' : null"
            class="grid grid-cols-[4.25rem_1fr] gap-3 border border-border bg-card"
            [class.outline-2]="esTuyo(partido)"
            [class.outline-accent-strong]="esTuyo(partido)"
            [class.-outline-offset-1]="esTuyo(partido)"
          >
            <div
              data-hora
              class="flex flex-col items-center justify-center bg-primary px-1 py-2
                     text-center text-on-primary"
            >
              <span class="font-display text-xl leading-none font-extrabold tabular-nums">
                {{ hora(partido.inicio) }}
              </span>
              <span class="mt-1 text-xs leading-tight tracking-wide uppercase">
                {{ partido.cancha }}
              </span>
            </div>
            <div class="min-w-0 py-2 pe-3">
              <ng-container [ngTemplateOutlet]="cuerpo" [ngTemplateOutletContext]="{ $implicit: partido }" />
            </div>
          </li>
        }
      </ul>
    }

    @if (porProgramar().length > 0) {
      <section data-por-programar class="mt-5">
        <!-- "Sin día ni hora" y no "por programar": un resultado se puede cargar sin
             que el partido se haya programado, y ese ya no está por programarse. -->
        <h3 class="subtitulo">Sin día ni hora</h3>
        <ul class="mt-2 grid gap-2">
          @for (partido of porProgramar(); track partido.ronda + '-' + partido.posicion) {
            <li
              data-turno
              [attr.data-tuyo]="esTuyo(partido) ? '' : null"
              class="border border-border bg-card px-3 py-2"
              [class.outline-2]="esTuyo(partido)"
              [class.outline-accent-strong]="esTuyo(partido)"
              [class.-outline-offset-1]="esTuyo(partido)"
            >
              <ng-container [ngTemplateOutlet]="cuerpo" [ngTemplateOutletContext]="{ $implicit: partido }" />
            </li>
          }
        </ul>
      </section>
    }

    <!-- Lo mismo en los dos lados: la ronda con su estado, los dos jugadores y el
         resultado. -->
    <ng-template #cuerpo let-partido>
      <p
        class="flex items-center gap-2 text-xs font-semibold tracking-wide
               text-muted-foreground uppercase"
      >
        {{ partido.ronda_nombre }}
        <app-insignia class="ms-auto" [variante]="estado(partido).variante">
          {{ estado(partido).texto }}
        </app-insignia>
      </p>
      @for (jugador of [partido.jugadorA, partido.jugadorB]; track $index) {
        <p
          class="mt-1 break-words"
          [attr.data-gano]="gano(partido, jugador) ? '' : null"
          [class.font-bold]="gano(partido, jugador)"
          [class.text-muted-foreground]="perdio(partido, jugador)"
        >
          <span
            [class.bg-accent-soft]="coincide(jugador)"
            [class.px-1]="coincide(jugador)"
          >
            {{ jugador ?? 'Por definir' }}
          </span>
          @if (gano(partido, jugador)) {
            <span class="icono align-middle text-base text-accent-strong" aria-hidden="true">
              check
            </span>
            <span class="sr-only">, ganó</span>
          }
        </p>
      }
      @if (partido.marcador) {
        <p class="mt-1 font-display text-base font-bold tabular-nums">
          {{ partido.marcador }}
        </p>
      }
      @if (partido.walkover && perdedor(partido); as ausente) {
        <p class="mt-1 text-xs text-muted-foreground">{{ ausente }} no se presentó.</p>
      }
    </ng-template>
  `,
})
export class OrdenDeJuego {
  readonly partidos = input.required<PartidoPublico[]>();

  /** Lo que se escribió en el buscador. Compartido con el árbol desde T137. */
  readonly busqueda = model('');

  /** La búsqueda sin tildes ni mayúsculas: "tomas" encuentra a "Tomás". */
  private readonly buscado = computed(() => normalizar(this.busqueda().trim()));

  /**
   * Los partidos que se juegan: **sin los byes**, que son un lugar vacío del cuadro y no
   * un partido.
   */
  private readonly jugables = computed(() =>
    this.partidos().filter(
      (partido) =>
        !(partido.ronda === 1 && (partido.jugadorA === null) !== (partido.jugadorB === null)),
    ),
  );

  protected readonly porDia = computed((): DiaDeJuego[] => {
    const programados = this.jugables()
      .filter((partido) => partido.inicio !== null)
      .sort(
        (a, b) =>
          (a.inicio as string).localeCompare(b.inicio as string) ||
          (a.cancha ?? '').localeCompare(b.cancha ?? '', 'es'),
      );

    const dias = new Map<string, PartidoPublico[]>();
    for (const partido of programados) {
      const fecha = fechaEnElClub(partido.inicio as string);
      dias.set(fecha, [...(dias.get(fecha) ?? []), partido]);
    }

    return [...dias].map(([fecha, partidos]) => ({
      fecha,
      titulo: diaEnPalabras(fecha),
      partidos,
    }));
  });

  /** Los que no tienen hora, por ronda y posición: la final va al final. */
  protected readonly porProgramar = computed(() =>
    this.jugables()
      .filter((partido) => partido.inicio === null)
      .sort((a, b) => a.ronda - b.ronda || a.posicion - b.posicion),
  );

  protected readonly encontrados = computed(
    () => this.jugables().filter((partido) => this.esTuyo(partido)).length,
  );

  protected readonly resumen = computed(() => {
    if (this.buscado() === '') return '';

    const cuantos = this.encontrados();
    return cuantos === 0
      ? 'Nadie con ese nombre en esta categoría.'
      : `${cuantos} ${cuantos === 1 ? 'partido' : 'partidos'} de "${this.busqueda().trim()}".`;
  });

  protected coincide(jugador: string | null): boolean {
    const buscado = this.buscado();

    return buscado !== '' && jugador !== null && normalizar(jugador).includes(buscado);
  }

  protected esTuyo(partido: PartidoPublico): boolean {
    return this.coincide(partido.jugadorA) || this.coincide(partido.jugadorB);
  }

  protected estado(partido: PartidoPublico): { texto: string; variante: VarianteInsignia } {
    if (partido.ganador !== null) return { texto: 'Jugado', variante: 'exito' };
    if (partido.inicio !== null) return { texto: 'Programado', variante: 'info' };
    return { texto: 'Sin hora', variante: 'neutro' };
  }

  protected hora(instante: string | null): string {
    return instante === null ? '' : horaEnElClub(instante);
  }

  /**
   * Por nombre y no por id: la respuesta pública no trae ids de jugadores, a propósito.
   */
  protected gano(partido: PartidoPublico, jugador: string | null): boolean {
    return jugador !== null && partido.ganador === jugador;
  }

  protected perdio(partido: PartidoPublico, jugador: string | null): boolean {
    return jugador !== null && partido.ganador !== null && partido.ganador !== jugador;
  }

  /** El que no se presentó, en un walkover: el que no ganó. */
  protected perdedor(partido: PartidoPublico): string | null {
    return [partido.jugadorA, partido.jugadorB].find(
      (jugador) => this.perdio(partido, jugador),
    ) ?? null;
  }

  protected valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
