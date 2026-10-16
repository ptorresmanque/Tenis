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
import { MatCheckbox } from '@angular/material/checkbox';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatTableModule } from '@angular/material/table';

import { proveerCampos } from '../../ui/campos';
import { horaATexto, proveerFechaYHora, textoAHora } from '../../ui/fecha-y-hora';
import { AdminCanchas, AmbitoDeReglas } from './admin-canchas.service';
import { LO_HECHO } from '../../ui/material';

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
  /** Como las entrega el selector de Material, y a texto al guardar (A5, T244). */
  horaApertura: Date | null;
  horaCierre: Date | null;
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
  imports: [
    MatCheckbox,
    MatFormFieldModule,
    MatInput,
    MatTimepickerModule,
    MatButton,
    FormsModule,
    MatTableModule,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <form class="mt-2" (ngSubmit)="guardar()">
      <!-- La tabla lleva siete filas de dos horas cada una y no se encoge más:
           el scroll va acá para que no empuje el ancho del documento entero. -->
      <div class="overflow-x-auto">
      <table mat-table [attr.aria-label]="'Horario de apertura de ' + ambito().nombre" class="densa text-sm" [dataSource]="filas()" [trackBy]="porDia">
        <ng-container matColumnDef="dia">
          <th mat-header-cell *matHeaderCellDef scope="col" class="pe-3 text-start font-medium">
            Día
          </th>
          <th
            *matCellDef="let fila"
            scope="row"
            class="mat-mdc-cell mdc-data-table__cell pe-3 py-1 text-start font-normal"
          >
            {{ nombreDia(fila.diaSemana) }}
          </th>
        </ng-container>
        <ng-container matColumnDef="abre">
          <th mat-header-cell *matHeaderCellDef scope="col" class="pe-3 text-start font-medium">
            Abre
          </th>
          <td mat-cell *matCellDef="let fila" class="pe-3 py-1">
            <mat-checkbox
              [aria-label]="'Abre el ' + nombreDia(fila.diaSemana)"
              [ngModel]="fila.abre"
              (ngModelChange)="cambiar(fila.diaSemana, { abre: $event })"
              [name]="'abre-' + clave() + '-' + fila.diaSemana"
            />
          </td>
        </ng-container>
        <ng-container matColumnDef="desde">
          <th mat-header-cell *matHeaderCellDef scope="col" class="pe-3 text-start font-medium">
            Desde
          </th>
          <td mat-cell *matCellDef="let fila" class="pe-3 py-1">
            <mat-form-field class="chico w-32">
              <input
                matInput
                [id]="'desde-' + clave() + '-' + fila.diaSemana"
                [name]="'desde-' + clave() + '-' + fila.diaSemana"
                placeholder="hh:mm"
                autocomplete="off"
                [matTimepicker]="relojDesde"
                [attr.aria-label]="'Apertura del ' + nombreDia(fila.diaSemana)"
                [disabled]="!fila.abre"
                [ngModel]="fila.horaApertura"
                (ngModelChange)="cambiar(fila.diaSemana, { horaApertura: $event })"
              />
              <mat-timepicker-toggle
                matIconSuffix
                aria-label="Elegir la hora"
                [for]="relojDesde"
              />
              <mat-timepicker #relojDesde />
            </mat-form-field>
          </td>
        </ng-container>
        <ng-container matColumnDef="hasta">
          <th mat-header-cell *matHeaderCellDef scope="col" class="text-start font-medium">
            Hasta
          </th>
          <td mat-cell *matCellDef="let fila" class="py-1">
            <mat-form-field class="chico w-32">
              <input
                matInput
                [id]="'hasta-' + clave() + '-' + fila.diaSemana"
                [name]="'hasta-' + clave() + '-' + fila.diaSemana"
                placeholder="hh:mm"
                autocomplete="off"
                [matTimepicker]="relojHasta"
                [attr.aria-label]="'Cierre del ' + nombreDia(fila.diaSemana)"
                [disabled]="!fila.abre"
                [ngModel]="fila.horaCierre"
                (ngModelChange)="cambiar(fila.diaSemana, { horaCierre: $event })"
              />
              <mat-timepicker-toggle
                matIconSuffix
                aria-label="Elegir la hora"
                [for]="relojHasta"
              />
              <mat-timepicker #relojHasta />
            </mat-form-field>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="COLUMNAS; sticky: true"></tr>
        <tr mat-row *matRowDef="let fila; columns: COLUMNAS"></tr>
      </table>
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-3">
        <button
          matButton="outlined"
          type="submit"
          [disabled]="guardando()"
          [attr.aria-busy]="guardando()"
          class="chico"
        >
          Guardar horario
        </button>

        <span role="status" aria-live="polite" class="text-sm">
          @if (error()) {
            <span class="text-destructive">{{ error() }}</span>
          }
        </span>
      </div>
    </form>
  `,
})
export class EditorHorarios {
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(AdminCanchas);

  readonly ambito = input.required<AmbitoDeReglas>();
  readonly guardado = output<void>();

  /**
   * Para los `id` y los `name` del formulario. El club no tiene número, y sin esto
   * sus campos se llamarían "desde-null-1", que además choca con cualquier otro
   * ámbito sin id que aparezca después.
   */
  protected readonly clave = computed(() => this.ambito().id ?? 'club');

  /** La fila es del día, no del objeto: si no, la tabla la rehace en cada tecla. */
  protected readonly porDia = (_: number, fila: FilaDeDia) => fila.diaSemana;

  protected readonly COLUMNAS = ['dia', 'abre', 'desde', 'hasta'];

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

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
          horaApertura: textoAHora(suyo?.horaApertura ?? '08:00'),
          horaCierre: textoAHora(suyo?.horaCierre ?? '22:00'),
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
    this.guardando.set(true);

    try {
      await this.api.fijarHorarios(
        this.ambito().id,
        this.filas()
          .filter((fila) => fila.abre)
          .map(({ diaSemana, horaApertura, horaCierre }) => ({
            diaSemana,
            horaApertura: horaATexto(horaApertura),
            horaCierre: horaATexto(horaCierre),
          })),
      );

      this.snackBar.open('Horario guardado.', undefined, LO_HECHO);
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
