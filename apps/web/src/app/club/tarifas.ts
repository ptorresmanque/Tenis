import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { Insignia } from '../ui/insignia';

/** Espejo de `TarifaPublica` en la API. */
interface Tarifa {
  canchaId: number | null;
  cancha: string | null;
  /** En la general: nulo = toda cancha, true = solo techadas, false = solo abiertas (T98). */
  techada: boolean | null;
  diaSemana: number | null;
  horaDesde: string;
  horaHasta: string;
  esPico: boolean;
  montoClp: number;
  /** Nulo: la hora y media no se vende en esa franja (T81). */
  montoClp90: number | null;
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
      <h2 id="titulo-tarifas" class="titular text-5xl sm:text-6xl">Tarifas y horarios</h2>
      <p class="mt-1 max-w-prose text-muted-foreground">
        Lo que cuesta arrendar 1 hora o 1 hora y media.
        <strong>Los socios no pagan por reservar</strong>:
        su cuota mensual les da derecho a cancha.
      </p>

      @if (tarifas.error()) {
        <p class="mt-4 text-destructive">
          No se pudieron cargar las tarifas. Reintenta en un momento.
        </p>
      } @else if (tarifas.value(); as lista) {
        @if (lista.length > 0) {
          <!-- EN EL TELÉFONO, UNA TARJETA POR FRANJA. La tabla de cinco columnas no cabe a
               375 px y, desplazada hacia el lado, escondía justo los precios. La tarjeta
               lleva el horario en el rótulo de la grilla —la misma idea se ve igual en las
               dos páginas— y los dos precios en la cifra condensada, que es lo que se busca. -->
          <ul
            class="mt-4 grid gap-3 sm:hidden"
            aria-label="Tarifas de arriendo por 1 hora y por 1 hora y media, vigentes hoy"
          >
            @for (tarifa of lista; track clave(tarifa)) {
              <li data-tarifa-tarjeta class="bg-card p-4 shadow-md">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rotulo-hora px-2 py-1 font-display text-2xl leading-none"
                    [class.rotulo-hora-pico]="tarifa.esPico"
                    >{{ tarifa.horaDesde }}–{{ tarifa.horaHasta }}</span
                  >
                  @if (tarifa.esPico) {
                    <app-insignia variante="aviso" icono="trending_up">Hora pico</app-insignia>
                  }
                </div>

                <dl class="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <dt class="text-sm text-muted-foreground">1 hora</dt>
                    <dd class="font-display text-2xl font-bold text-primary">
                      {{ pesos(tarifa.montoClp) }}
                    </dd>
                  </div>
                  @if (tarifa.montoClp90 !== null) {
                    <div>
                      <dt class="text-sm text-muted-foreground">1 hora y media</dt>
                      <dd class="font-display text-2xl font-bold text-primary">
                        {{ pesos(tarifa.montoClp90) }}
                      </dd>
                    </div>
                  } @else {
                    <!-- Sin el precio, la tarjeta no inventa un guion ni un cero (T81). El
                         grupo entero es para lectores: una <dl> solo admite pares. -->
                    <div class="sr-only">
                      <dt>1 hora y media</dt>
                      <dd>No se arrienda por hora y media</dd>
                    </div>
                  }
                </dl>

                <p class="mt-2 text-sm text-muted-foreground">
                  {{ dondeYCuando(tarifa, lista) }}
                </p>
              </li>
            }
          </ul>

          <!-- Desde 640 px, la tabla. Como el tablero de una transmisión (TV4.1): la tarjeta
               sin borde, con su sombra, y el precio en la cifra condensada. Los precios van
               justo después del horario: es lo que se viene a buscar. -->
          <div class="mt-4 hidden overflow-x-auto bg-card shadow-md sm:block">
            <table class="tabla">
              <caption class="sr-only">
                Tarifas de arriendo por 1 hora y por 1 hora y media, vigentes hoy
              </caption>
              <thead>
                <tr>
                  <th scope="col">Horario</th>
                  <th scope="col">1 hora</th>
                  <th scope="col">1 hora y media</th>
                  <th scope="col">Cancha</th>
                  <th scope="col">Días</th>
                </tr>
              </thead>
              <tbody>
                @for (tarifa of lista; track clave(tarifa)) {
                  <tr>
                    <td class="whitespace-nowrap">
                      {{ tarifa.horaDesde }}–{{ tarifa.horaHasta }}
                      @if (tarifa.esPico) {
                        <!-- Ámbar, como el rótulo "Pico" del marcador de la portada: la
                             misma idea no cambia de color de una página a otra. -->
                        <app-insignia variante="aviso" icono="trending_up">
                          Hora pico
                        </app-insignia>
                      }
                    </td>
                    <td class="font-display text-xl font-bold whitespace-nowrap text-primary">
                      {{ pesos(tarifa.montoClp) }}
                    </td>
                    <td class="font-display text-xl font-bold whitespace-nowrap text-primary">
                      @if (tarifa.montoClp90 !== null) {
                        {{ pesos(tarifa.montoClp90) }}
                      } @else {
                        <!-- Vacía a la vista: un guion o un cero invitarían a pedir algo
                             que no se vende (T81). El lector de pantalla sí lo dice: una
                             celda "en blanco" no le explica nada a quien la escucha. -->
                        <span class="sr-only">No se arrienda por hora y media</span>
                      }
                    </td>
                    <td>{{ donde(tarifa, lista) }}</td>
                    <td>{{ cuandoRige(tarifa.diaSemana) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }

      @if (aperturas().length > 0) {
        <h3 class="mt-8 font-display text-lg font-bold tracking-wide uppercase">
          Horario de apertura
        </h3>
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

  protected readonly aperturas = computed(() =>
    this.horarios.hasValue() ? this.horarios.value().general : [],
  );

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

  /**
   * Qué hace única a una fila de precios.
   *
   * Compuesta y no el id de la franja: el id no viaja en la respuesta pública —es
   * superficie que nadie necesita— y `$index` está prohibido en el proyecto para
   * datos que cambian, con razón: al recargar con otra tarifa al medio, Angular
   * reusaría las filas equivocadas.
   */
  protected clave(tarifa: Tarifa): string {
    // Con el tipo (T99): "todas" y "techadas" pueden compartir horario y día.
    return `${tarifa.canchaId}|${tarifa.techada}|${tarifa.diaSemana}|${tarifa.horaDesde}`;
  }

  /**
   * A qué canchas aplica, dicho por lo que **de verdad** cubre (T99).
   *
   * La general "de todas" no cubre a las techadas en un horario donde las techadas
   * tienen su propia tarifa: ahí la de techadas gana (T98). Llamarla "Todas" le
   * prometería a una techada un precio que no paga, así que se nombra por el tipo que
   * le queda.
   *
   * ponytail: solo mira el mismo tramo exacto (horas y día). Una tarifa de techadas que
   * pisa a medias a la general deja esa fila diciendo "Todas"; si el club arma tarifas
   * así, partir la general por tramos.
   */
  protected donde(tarifa: Tarifa, lista: Tarifa[]): string {
    if (tarifa.cancha) return tarifa.cancha;
    if (tarifa.techada === true) return 'Canchas techadas';
    if (tarifa.techada === false) return 'Canchas al aire libre';

    const tiposConTarifaPropia = new Set(
      lista
        .filter(
          (otra) =>
            otra.canchaId === null &&
            otra.techada != null &&
            otra.horaDesde === tarifa.horaDesde &&
            otra.horaHasta === tarifa.horaHasta &&
            otra.diaSemana === tarifa.diaSemana,
        )
        .map((otra) => otra.techada),
    );

    if (tiposConTarifaPropia.size === 1) {
      return tiposConTarifaPropia.has(true)
        ? 'Canchas al aire libre'
        : 'Canchas techadas';
    }
    return 'Todas las canchas';
  }

  protected cuandoRige(dia: number | null): string {
    return dia === null ? 'Todos' : this.nombreDia(dia);
  }

  /**
   * La línea de la tarjeta: "Todas las canchas, todos los días" o "Cancha 3, los sábados".
   *
   * En plural, como se dice: "sábado" y "domingo" ganan la ese; "lunes" a "viernes" ya la
   * traen.
   */
  protected dondeYCuando(tarifa: Tarifa, lista: Tarifa[]): string {
    const donde = this.donde(tarifa, lista);

    if (tarifa.diaSemana === null) return `${donde}, todos los días`;

    const dia = this.nombreDia(tarifa.diaSemana).toLowerCase();
    return `${donde}, los ${dia.endsWith('o') ? `${dia}s` : dia}`;
  }
}
