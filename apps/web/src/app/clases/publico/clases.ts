import { Component, computed, inject, resource } from '@angular/core';

import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { FormularioContacto } from '../../club/formulario-contacto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Foto } from '../../ui/foto';
import { Insignia } from '../../ui/insignia';
import { ClasePublica, Clases, NIVELES, NivelClase } from '../clases.service';

/**
 * Las clases del club, para quien todavía no es del club.
 *
 * **Es el circuito del apoderado que busca clases para su hijo**: hasta hoy era el
 * único de los cinco públicos del perfil sin ninguna vía de contacto. Ve quiénes son
 * los profesores y qué hay esta semana, y pregunta desde acá mismo.
 *
 * **No se puede inscribir desde el sitio**, porque el club es quien inscribe —pregunta
 * 12 del spec—. Lo que hay es el formulario, que llega a la bandeja con el nombre y el
 * teléfono de quien preguntó. Ese es el circuito completo: ve los horarios, pregunta,
 * y alguien lo llama.
 */
@Component({
  selector: 'app-clases-publicas',
  imports: [EstadoVacio, Foto, Insignia, FormularioContacto],
  template: `
    <section
      class="relative isolate -mx-4 overflow-hidden sm:mx-0 sm:rounded-region"
      aria-labelledby="clases"
    >
      <app-foto
        descripcion="Un profesor dando clase a un grupo, con los alumnos en la línea de fondo"
        proporcion="16/9"
        [prioritaria]="true"
        claseCaja="min-h-[22rem]"
      />
      <div
        class="absolute inset-0 bg-gradient-to-t from-campo via-campo/90 to-campo/65"
        aria-hidden="true"
      ></div>

      <div class="absolute inset-0 flex flex-col justify-end gap-3 p-6 text-on-campo sm:p-10">
        <h1 id="clases" class="titular text-6xl sm:text-7xl lg:text-8xl">
          Clases con profesor
        </h1>
        <p class="max-w-prose text-lg text-on-campo/90">
          Iniciación, competitivo y clases para niños. Mira los horarios de esta semana y
          escríbenos.
        </p>
      </div>
    </section>

    <!-- Los títulos de la A, como el del formulario de contacto de abajo (TV4.4). -->
    <h2 class="titular mt-16 text-5xl sm:text-6xl">Quiénes enseñan</h2>
    @if (datos.value(); as info) {
      @if (info.profesores.length === 0) {
        <p class="mt-2 text-muted-foreground">
          Estamos armando el equipo de profesores para la próxima temporada.
        </p>
      } @else {
        <ul class="mt-4 divide-y divide-border border-y border-border">
          @for (profesor of info.profesores; track profesor.nombreVisible) {
            <li class="flex flex-wrap items-baseline justify-between gap-2 py-4">
              <p class="titulo-tarjeta">
                {{ profesor.nombreVisible }}
              </p>
              <p class="text-muted-foreground">{{ profesor.especialidad }}</p>
            </li>
          }
        </ul>
      }

      <h2 class="titular mt-16 text-5xl sm:text-6xl">Esta semana</h2>

      @if (info.clases.length === 0) {
        <app-estado-vacio
          class="mt-3 block"
          icono="event_busy"
          titulo="No hay clases programadas esta semana"
          detalle="Escríbenos y te avisamos cuando se abra el próximo grupo."
        />
      } @else {
        @for (dia of porDia(); track dia.fecha) {
          <!-- Cada día lo encabeza un rótulo de transmisión, con su corte (TV4.4). -->
          <h3
            class="mt-8 inline-flex bg-rotulo py-1.5 ps-4 font-display text-sm font-bold
                   tracking-wider text-on-rotulo uppercase corte-fin"
          >
            {{ enPalabras(dia.fecha) }}
          </h3>
          <ul class="divide-y divide-border border-t border-border">
            @for (clase of dia.clases; track clase.id) {
              <li class="flex flex-wrap items-center gap-3 py-4">
                <span class="font-display text-2xl font-bold tabular-nums">
                  {{ hora(clase.inicio) }}–{{ hora(clase.fin) }}
                </span>
                <app-insignia variante="info" icono="school">
                  {{ nivel(clase.nivel) }}
                </app-insignia>
                <span class="text-sm text-muted-foreground">
                  {{ clase.profesor }} · {{ clase.cancha }}
                </span>

                @if (clase.cuposLibres === 0) {
                  <app-insignia variante="neutro" icono="block" class="ms-auto">
                    Sin cupos
                  </app-insignia>
                } @else {
                  <!-- Cupos libres: el verde de "libre", con fondo sólido. -->
                  <app-insignia variante="libre" icono="event_available" class="ms-auto">
                    {{ clase.cuposLibres }}
                    {{ clase.cuposLibres === 1 ? 'cupo' : 'cupos' }}
                  </app-insignia>
                }
              </li>
            }
          </ul>
        }
      }
    } @else if (datos.isLoading()) {
      <p class="mt-3 text-muted-foreground">Cargando los horarios…</p>
    }

    <!-- El formulario acá mismo y no un enlace a otra página: quien acaba de mirar los
         horarios y decide preguntar no debería tener que buscar dónde. Llega marcado
         como consulta de clases, que es a qué manos tiene que ir. -->
    <div class="mt-10">
      <app-formulario-contacto tipoInicial="CLASES" />
    </div>
  `,
})
export class ClasesPublicas {
  private readonly api = inject(Clases);

  protected readonly datos = resource({ loader: () => this.api.publicas() });

  /**
   * Las clases agrupadas por día.
   *
   * Una lista corrida de catorce clases no se lee: quien busca "los martes a las seis"
   * necesita ver los días. La fecha se saca del instante en hora del club, no en la
   * del navegador de quien mira.
   */
  protected readonly porDia = computed(() => {
    const dias = new Map<string, ClasePublica[]>();

    for (const clase of this.datos.value()?.clases ?? []) {
      const fecha = fechaEnElClub(clase.inicio);
      dias.set(fecha, [...(dias.get(fecha) ?? []), clase]);
    }

    return [...dias].map(([fecha, clases]) => ({ fecha, clases }));
  });

  protected readonly hora = horaEnElClub;
  protected readonly enPalabras = diaEnPalabras;

  protected nivel(clave: NivelClase): string {
    return NIVELES[clave] ?? clave;
  }
}
