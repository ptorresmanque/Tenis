import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { mensajeDelServidor } from '../../core/errores';
import { proveerCampos } from '../../ui/campos';
import { fechaATexto, proveerFechaYHora } from '../../ui/fecha-y-hora';
import { Torneo, Torneos } from '../torneos.service';
import { ElegirNivel, NivelElegido } from './elegir-nivel';

/**
 * El alta de un torneo (T291, SPEC-panel.md D9): un diálogo que abre el FAB «Nuevo torneo».
 * Antes era un formulario que se desplegaba en la página con un botón «Crear torneo / Cerrar».
 *
 * **Pide lo que la API exige y nada más**: el nombre, las tres fechas y el primer tour con su
 * nivel (D10: un torneo que no suma para nada no tiene ranking). La superficie y lo demás se
 * completan en la ficha, adonde lleva el torneo recién creado.
 *
 * Crea el torneo él mismo, y no quien lo abre: así el error del servidor («no puede terminar
 * antes de empezar») se ve acá, con lo escrito. Se cierra con el torneo creado.
 */
@Component({
  selector: 'app-nuevo-torneo',
  imports: [
    MatDialogModule,
    MatButton,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    FormsModule,
    ElegirNivel,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <!-- El título va dentro del formulario y el formulario no tiene caja: así título y contenido
         son hermanos, y Material le quita al contenido el relleno de arriba (como el motivo). -->
    <!-- Los calendarios confirman con «Cancelar / Aplicar» y dicen su formato a la vista (D16 y
         D17): son los primeros así, y T303 lleva a los demás. Los dos botones son de texto,
         como en el selector de fecha de Material 3: la acción principal es «Crear torneo». -->
    <form class="contents" (ngSubmit)="crear()">
      <h2 mat-dialog-title>Nuevo torneo</h2>

      <mat-dialog-content>
        <div class="grid gap-3 sm:grid-cols-2">
          <mat-form-field class="sm:col-span-2">
            <mat-label>Nombre</mat-label>
            <input
              matInput
              name="nombre"
              placeholder="Copa de verano"
              autocomplete="off"
              [(ngModel)]="datos.nombre"
            />
          </mat-form-field>

          <mat-form-field>
            <mat-label>Empieza</mat-label>
            <input
              matInput
              id="nuevo-fechaInicio"
              name="fechaInicio"
              autocomplete="off"
              [matDatepicker]="calendarioFechaInicio"
              [(ngModel)]="datos.fechaInicio"
            />
            <mat-datepicker-toggle matIconSuffix [for]="calendarioFechaInicio" />
            <mat-hint>dd-mm-aaaa</mat-hint>
            <mat-datepicker #calendarioFechaInicio>
              <mat-datepicker-actions>
                <button matButton type="button" matDatepickerCancel>Cancelar</button>
                <button matButton type="button" matDatepickerApply>Aplicar</button>
              </mat-datepicker-actions>
            </mat-datepicker>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Termina</mat-label>
            <input
              matInput
              id="nuevo-fechaFin"
              name="fechaFin"
              autocomplete="off"
              [matDatepicker]="calendarioFechaFin"
              [(ngModel)]="datos.fechaFin"
            />
            <mat-datepicker-toggle matIconSuffix [for]="calendarioFechaFin" />
            <mat-hint>dd-mm-aaaa</mat-hint>
            <mat-datepicker #calendarioFechaFin>
              <mat-datepicker-actions>
                <button matButton type="button" matDatepickerCancel>Cancelar</button>
                <button matButton type="button" matDatepickerApply>Aplicar</button>
              </mat-datepicker-actions>
            </mat-datepicker>
          </mat-form-field>

          <mat-form-field class="sm:col-span-2">
            <mat-label>Cierra la inscripción</mat-label>
            <input
              matInput
              id="nuevo-cierreInscripcion"
              name="cierreInscripcion"
              autocomplete="off"
              [matDatepicker]="calendarioCierreInscripcion"
              [(ngModel)]="datos.cierreInscripcion"
            />
            <mat-datepicker-toggle matIconSuffix [for]="calendarioCierreInscripcion" />
            <mat-hint>dd-mm-aaaa</mat-hint>
            <mat-datepicker #calendarioCierreInscripcion>
              <mat-datepicker-actions>
                <button matButton type="button" matDatepickerCancel>Cancelar</button>
                <button matButton type="button" matDatepickerApply>Aplicar</button>
              </mat-datepicker-actions>
            </mat-datepicker>
          </mat-form-field>

          <!-- **El primer tour va en el alta** (D10): un torneo que no suma para nada no
               tiene ranking. Los demás se agregan en Ajustes. -->
          <div class="sm:col-span-2">
            <app-elegir-nivel [(eleccion)]="tour" />
          </div>

          <!-- El del servidor: dice si las fechas no cierran o si el nivel no es de ese tour. -->
          <p aria-live="polite" class="text-sm text-destructive sm:col-span-2">{{ error() }}</p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions>
        <!-- Mientras crea no se cierra (tampoco con Escape ni el fondo): el torneo quedaría
             creado sin llevar a su ficha. -->
        <button matButton type="button" mat-dialog-close [disabled]="guardando()">
          Cancelar
        </button>
        <button
          matButton="filled"
          type="submit"
          [attr.aria-busy]="guardando()"
          [disabled]="guardando() || tour().nivelId === null"
        >
          Crear torneo
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class NuevoTorneo {
  private readonly api = inject(Torneos);
  private readonly ref = inject<MatDialogRef<NuevoTorneo, Torneo>>(MatDialogRef);

  /** Las fechas, como las entrega el calendario, y a texto recién al crear (A5, T244). */
  protected readonly datos = {
    nombre: '',
    fechaInicio: null as Date | null,
    fechaFin: null as Date | null,
    cierreInscripcion: null as Date | null,
  };
  /** El tour y el nivel. Señal, porque el selector la escribe con `model`. */
  protected readonly tour = signal<NivelElegido>({ tourId: null, nivelId: null });

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async crear(): Promise<void> {
    const { tourId, nivelId } = this.tour();
    if (tourId === null || nivelId === null) return;

    this.error.set(null);
    this.guardando.set(true);
    this.ref.disableClose = true;
    try {
      this.ref.close(
        await this.api.crearTorneo({
          nombre: this.datos.nombre,
          fechaInicio: fechaATexto(this.datos.fechaInicio),
          fechaFin: fechaATexto(this.datos.fechaFin),
          cierreInscripcion: fechaATexto(this.datos.cierreInscripcion),
          superficie: null,
          tours: [{ tourId, nivelId }],
        }),
      );
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo crear el torneo.'));
    } finally {
      this.guardando.set(false);
      this.ref.disableClose = false;
    }
  }
}
