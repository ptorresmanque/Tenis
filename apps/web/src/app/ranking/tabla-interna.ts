import { Component, computed, inject, resource } from '@angular/core';

import { diaConAnioEnPalabras } from '../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../ui/estado-vacio';
import { FilaInterna, Ranking } from './ranking.service';

/**
 * La tabla interna del club: el Elo de los amistosos entre socios.
 *
 * **Los inactivos van aparte, no mezclados.** Quien no juega hace seis meses sale de la
 * tabla principal con su Elo intacto: un ranking con alguien arriba que no juega hace
 * dos años no lo cree nadie, y ponerlo al fondo de la misma lista lo haría parecer malo
 * en vez de ausente.
 *
 * La pantalla dice dos cosas que evitan la llamada al club: **cuál es el último partido
 * que cuenta** y que **solo cuentan los confirmados**. Las dos preguntas que llegan son
 * "cargué uno y no se movió" y "¿por qué no estoy?".
 */
@Component({
  selector: 'app-tabla-interna',
  imports: [EstadoVacio],
  template: `
    @if (tabla.error()) {
      <p class="mt-4 text-destructive">
        No se pudo cargar la tabla del club. Reintenta en un momento.
      </p>
    } @else if (tabla.value(); as datos) {
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Solo cuentan los partidos <strong>confirmados</strong> por el rival.
        @if (datos.ultimoPartido; as ultimo) {
          El último que entró es del {{ enPalabras(ultimo) }}.
        }
      </p>

      @if (datos.posiciones.length === 0) {
        <app-estado-vacio
          class="mt-4 block"
          icono="sports_tennis"
          titulo="Todavía no hay partidos confirmados"
          detalle="En cuanto dos socios carguen uno y lo confirmen, la tabla aparece acá."
        />
      } @else {
        <div class="mt-4 overflow-x-auto" data-tabla="activos">
          <table class="tabla text-sm">
            <caption class="sr-only">
              Elo de los socios que jugaron en los últimos seis meses
            </caption>
            <thead>
              <tr>
                <th scope="col">Puesto</th>
                <th scope="col">Socio</th>
                <th scope="col" class="numero">Elo</th>
                <th scope="col" class="numero">Jugados</th>
                <th scope="col" class="numero">Ganados</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of activos(); track fila.socioId) {
                <tr>
                  <td class="py-2 pr-3 font-semibold">{{ fila.puesto }}</td>
                  <!-- El nombre es el encabezado de fila y no el puesto: con empates
                       el puesto se repite, y uno que dice "1" en dos filas no
                       identifica ninguna. -->
                  <th scope="row">
                    {{ fila.nombre }}
                  </th>
                  <td class="numero font-semibold">{{ fila.elo }}</td>
                  <td class="py-2 pr-3 text-right text-muted-foreground">
                    {{ fila.partidos }}
                  </td>
                  <td class="py-2 text-right text-muted-foreground">
                    {{ fila.ganados }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (inactivos().length > 0) {
        <section class="mt-8">
          <h3 class="font-display text-base font-semibold">Sin jugar hace rato</h3>
          <p class="mt-1 max-w-prose text-sm text-muted-foreground">
            No juegan un partido confirmado desde antes del
            {{ enPalabras(datos.inactivosDesde) }}, así que salen de la tabla. Su puntaje los
            espera: vuelven con el mismo.
          </p>

          <div class="mt-3 overflow-x-auto" data-tabla="inactivos">
            <table class="tabla text-sm">
              <caption class="sr-only">
                Socios fuera de la tabla principal, con su Elo conservado
              </caption>
              <thead>
                <tr>
                  <th scope="col">Socio</th>
                  <th scope="col" class="numero">Elo</th>
                  <th scope="col" class="numero">Último partido</th>
                </tr>
              </thead>
              <tbody>
                @for (fila of inactivos(); track fila.socioId) {
                  <tr>
                    <th scope="row">
                      {{ fila.nombre }}
                    </th>
                    <td class="numero">{{ fila.elo }}</td>
                    <td class="py-2 text-right text-muted-foreground">
                      {{ enPalabras(fila.ultimoPartido) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    } @else if (tabla.isLoading()) {
      <p class="mt-4 text-muted-foreground">Cargando la tabla del club…</p>
    }
  `,
})
export class TablaInterna {
  private readonly api = inject(Ranking);

  protected readonly tabla = resource({ loader: () => this.api.interno() });

  protected readonly activos = computed(() => this.deLaTabla(true));
  protected readonly inactivos = computed(() => this.deLaTabla(false));

  protected readonly enPalabras = diaConAnioEnPalabras;

  private deLaTabla(activo: boolean): FilaInterna[] {
    return (this.tabla.value()?.posiciones ?? []).filter((fila) => fila.activo === activo);
  }
}
