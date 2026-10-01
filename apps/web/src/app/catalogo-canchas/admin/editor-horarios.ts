import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminCanchas, AmbitoDeReglas } from './admin-canchas.service';

const DIAS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/** Los días de la semana, en el orden de `Date#getUTCDay`. */
const SEMANA = [0, 1, 2, 3, 4, 5, 6];

interface FilaDeDia {
  diaSemana: number;
  abre: boolean;
  horaApertura: string;
  horaCierre: string;
}

/**
 * El horario de apertura de una cancha, los siete días juntos.
 *
 * Se manda entero y reemplaza al anterior: mandar solo los días tocados obliga a
 * decidir qué significa un día ausente —¿sin cambios o cerrado?— y esa ambigüedad
 * termina en una cancha que abre un día que el club creía cerrado.
 */
@Component({
  selector: 'app-editor-horarios',
  imports: [FormsModule],
  template: `
    <form class="mt-2" (ngSubmit)="guardar()">
      <!-- La tabla lleva siete filas de dos horas cada una y no se encoge más:
           el scroll va acá para que no empuje el ancho del documento entero. -->
      <div class="overflow-x-auto">
      <table class="tabla tabla-densa text-sm">
        <caption class="sr-only">
          Horario de apertura de {{ ambito().nombre }}
        </caption>
        <thead>
          <tr class="text-muted-foreground">
            <th scope="col" class="pe-3 text-start font-medium">Día</th>
            <th scope="col" class="pe-3 text-start font-medium">Abre</th>
            <th scope="col" class="pe-3 text-start font-medium">Desde</th>
            <th scope="col" class="text-start font-medium">Hasta</th>
          </tr>
        </thead>
        <tbody>
          @for (fila of filas(); track fila.diaSemana) {
            <tr>
              <th scope="row" class="pe-3 py-1 text-start font-normal">
                {{ nombreDia(fila.diaSemana) }}
              </th>
              <td class="pe-3 py-1">
                <input
                  type="checkbox"
                  [attr.aria-label]="'Abre el ' + nombreDia(fila.diaSemana)"
                  [ngModel]="fila.abre"
                  (ngModelChange)="cambiar(fila.diaSemana, { abre: $event })"
                  [name]="'abre-' + clave() + '-' + fila.diaSemana"
                />
              </td>
              <td class="pe-3 py-1">
                <input
                  type="time"
                  class="campo campo-chico"
                  [attr.aria-label]="'Apertura del ' + nombreDia(fila.diaSemana)"
                  [disabled]="!fila.abre"
                  [ngModel]="fila.horaApertura"
                  (ngModelChange)="cambiar(fila.diaSemana, { horaApertura: $event })"
                  [name]="'desde-' + clave() + '-' + fila.diaSemana"
                />
              </td>
              <td class="py-1">
                <input
                  type="time"
                  class="campo campo-chico"
                  [attr.aria-label]="'Cierre del ' + nombreDia(fila.diaSemana)"
                  [disabled]="!fila.abre"
                  [ngModel]="fila.horaCierre"
                  (ngModelChange)="cambiar(fila.diaSemana, { horaCierre: $event })"
                  [name]="'hasta-' + clave() + '-' + fila.diaSemana"
                />
              </td>
            </tr>
          }
        </tbody>
      </table>
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          [disabled]="guardando()"
          class="boton boton-secundario boton-chico"
        >
          Guardar horario
        </button>

        <span role="status" aria-live="polite" class="text-sm">
          @if (error()) {
            <span class="text-destructive">{{ error() }}</span>
          } @else if (aviso()) {
            <span class="text-accent-strong">{{ aviso() }}</span>
          }
        </span>
      </div>
    </form>
  `,
})
export class EditorHorarios {
  private readonly api = inject(AdminCanchas);

  readonly ambito = input.required<AmbitoDeReglas>();
  readonly guardado = output<void>();

  /**
   * Para los `id` y los `name` del formulario. El club no tiene número, y sin esto
   * sus campos se llamarían "desde-null-1", que además choca con cualquier otro
   * ámbito sin id que aparezca después.
   */
  protected readonly clave = computed(() => this.ambito().id ?? 'club');

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  /**
   * Los siete días siempre, marcando cuáles abren. Una lista con solo los días que
   * tienen horario obligaría a agregar y quitar filas para decir "el martes
   * cerramos", que es la operación más común del panel.
   *
   * `linkedSignal` y no `computed`: se deriva de la cancha, pero el admin la edita.
   */
  protected readonly filas = linkedSignal<AmbitoDeReglas, FilaDeDia[]>({
    source: this.ambito,
    computation: (ambito) =>
      SEMANA.map((diaSemana) => {
        const suyo = ambito.horarios.find((h) => h.diaSemana === diaSemana);

        return {
          diaSemana,
          abre: suyo !== undefined,
          // Un día que no abría estrena las horas del club, que es lo que el
          // admin va a querer casi siempre.
          horaApertura: suyo?.horaApertura ?? '08:00',
          horaCierre: suyo?.horaCierre ?? '22:00',
        };
      }),
  });

  protected cambiar(diaSemana: number, cambio: Partial<FilaDeDia>): void {
    this.filas.update((filas) =>
      filas.map((fila) =>
        fila.diaSemana === diaSemana ? { ...fila, ...cambio } : fila,
      ),
    );
  }

  protected nombreDia(dia: number): string {
    return DIAS[dia] ?? `Día ${dia}`;
  }

  protected async guardar(): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.guardando.set(true);

    try {
      await this.api.fijarHorarios(
        this.ambito().id,
        this.filas()
          .filter((fila) => fila.abre)
          .map(({ diaSemana, horaApertura, horaCierre }) => ({
            diaSemana,
            horaApertura,
            horaCierre,
          })),
      );

      this.aviso.set('Horario guardado.');
      this.guardado.emit();
    } catch (falla) {
      // El mensaje del servidor: "El cierre tiene que ser posterior a la apertura"
      // dice qué corregir, y uno genérico obliga a adivinar cuál de los siete días
      // quedó mal.
      const mensaje = (falla as { error?: { message?: unknown } })?.error
        ?.message;

      this.error.set(
        typeof mensaje === 'string' ? mensaje : 'No se pudo guardar el horario.',
      );
    } finally {
      this.guardando.set(false);
    }
  }
}
