import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { Insignia } from '../ui/insignia';

/** Espejo de `TarifaPublica` en la API. */
interface Tarifa {
  canchaId: number | null;
  cancha: string | null;
  diaSemana: number | null;
  horaDesde: string;
  horaHasta: string;
  esPico: boolean;
  montoClp: number;
}

interface HorarioDelDia {
  diaSemana: number;
  horaApertura: string;
  horaCierre: string;
}

interface Horarios {
  general: HorarioDelDia[];
  porCancha: { cancha: string; horarios: HorarioDelDia[] }[];
}

const DIAS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/**
 * Cuánto sale una hora y a qué hora abre el club.
 *
 * Responde la pregunta que la grilla no responde: **"¿cuánto sale una hora los
 * sábados?"**. La grilla sirve para reservar —hay que elegir día, mirar bloques— y
 * quien todavía no es del club solo quiere saber el precio antes de decidir.
 *
 * Es el precio de lista y por eso es público: tenerlo detrás de una cuenta es la
 * barrera de entrada que describe la problemática 2.5 del perfil.
 */
@Component({
  selector: 'app-tarifas',
  imports: [Insignia],
  template: `
    <section aria-labelledby="titulo-tarifas">
      <h2 id="titulo-tarifas" class="font-display text-2xl font-semibold">
        Tarifas y horarios
      </h2>
      <p class="mt-1 max-w-prose text-muted-foreground">
        Lo que cuesta arrendar una hora. <strong>Los socios no pagan por reservar</strong>:
        su cuota mensual les da derecho a cancha.
      </p>

      @if (tarifas.value(); as lista) {
        @if (lista.length > 0) {
          <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table class="tabla">
              <caption class="sr-only">
                Tarifas de arriendo por hora, vigentes hoy
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cancha</th>
                  <th scope="col">Días</th>
                  <th scope="col">Horario</th>
                  <th scope="col">Valor por hora</th>
                </tr>
              </thead>
              <tbody>
                @for (tarifa of lista; track $index) {
                  <tr>
                    <td>{{ tarifa.cancha ?? 'Todas' }}</td>
                    <td>{{ cuandoRige(tarifa.diaSemana) }}</td>
                    <td class="whitespace-nowrap">
                      {{ tarifa.horaDesde }}–{{ tarifa.horaHasta }}
                      @if (tarifa.esPico) {
                        <app-insignia variante="info" icono="trending_up">
                          Hora pico
                        </app-insignia>
                      }
                    </td>
                    <td class="font-semibold whitespace-nowrap">
                      {{ pesos(tarifa.montoClp) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }

      @if (aperturas().length > 0) {
        <h3 class="mt-6 font-display text-lg font-semibold">Horario de apertura</h3>
        <ul class="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
          @for (dia of aperturas(); track dia.diaSemana) {
            <li>
              <span class="font-medium text-foreground">
                {{ nombreDia(dia.diaSemana) }}:
              </span>
              {{ dia.horaApertura }} a {{ dia.horaCierre }}
            </li>
          }
        </ul>

        @if (excepciones().length > 0) {
          <p class="mt-2 text-sm text-muted-foreground">
            Algunas canchas tienen su propio horario:
            {{ excepciones().join(', ') }}. Míralo en la disponibilidad.
          </p>
        }
      }
    </section>
  `,
})
export class Tarifas {
  protected readonly tarifas = httpResource<Tarifa[]>(() => '/api/tarifas', {
    defaultValue: [],
  });

  private readonly horarios = httpResource<Horarios>(() => '/api/horarios', {
    defaultValue: { general: [], porCancha: [] },
  });

  protected readonly aperturas = computed(() => this.horarios.value().general);

  /**
   * Las canchas que no siguen el horario general.
   *
   * Se nombran pero no se detallan: la tabla completa de siete días por cancha es
   * ilegible, y quien necesita ese detalle está eligiendo una hora —o sea, mirando la
   * disponibilidad, donde ya lo ve—.
   */
  protected readonly excepciones = computed(() =>
    this.horarios.value().porCancha.map((c) => c.cancha),
  );

  protected readonly pesos = enPesos;

  protected nombreDia(dia: number): string {
    return DIAS[dia] ?? `Día ${dia}`;
  }

  protected cuandoRige(dia: number | null): string {
    return dia === null ? 'Todos' : this.nombreDia(dia);
  }
}
