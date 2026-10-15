import { Component, inject, linkedSignal, resource, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  AdminCanchas,
  ConfiguracionDelClub,
} from '../catalogo-canchas/admin/admin-canchas.service';
import { mensajeDelServidor } from '../core/errores';
import { proveerCampos } from '../ui/campos';
import { Esqueleto } from '../ui/esqueleto';
import { LO_HECHO } from '../ui/material';

/** "07:00", de 7: las horas enteras del reloj del club. */
const enPunto = (hora: number) => `${String(hora).padStart(2, '0')}:00`;

/**
 * El informe de reservas del día por correo (T274, SPEC-revision-qa.md A9): si sale y a qué
 * hora. Lo manda un cron de cada hora (T275) a cada administrador y gestor, una vez por día,
 * al llegar a la hora elegida.
 *
 * Los dos controles guardan al tocarlos, como los interruptores de Usuarios (T249): no hay
 * nada más en la pestaña que esperar un «Guardar».
 */
@Component({
  selector: 'app-informe-diario',
  imports: [MatFormFieldModule, MatSelectModule, MatSlideToggle, Esqueleto],
  providers: [proveerCampos()],
  template: `
    <section class="mt-6" aria-labelledby="titulo-informe-diario">
      <h2 id="titulo-informe-diario" class="rotulo-seccion">Informe diario de reservas</h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Un correo con las reservas y las clases del día, a los administradores y gestores del club.
        Sale una vez al día, a la hora que elijas, y también si el día no tiene nada.
      </p>

      @if (configuracion.isLoading()) {
        <app-esqueleto class="mt-3 block" [filas]="2" etiqueta="Cargando el informe…" />
      } @else if (configuracion.error()) {
        <p class="mt-3 text-destructive">
          No se pudo cargar la configuración del informe. Reintenta en un momento.
        </p>
      } @else {
        <mat-slide-toggle
          class="mt-4 block"
          [checked]="activo()"
          [disabled]="guardando()"
          (change)="guardar({ informeDiarioActivo: $event.checked })"
        >
          Mandar el informe diario
        </mat-slide-toggle>

        <mat-form-field class="mt-4 w-40">
          <mat-label>Hora</mat-label>
          <mat-select
            name="hora"
            [value]="hora()"
            [disabled]="guardando()"
            (selectionChange)="guardar({ informeDiarioHora: $event.value })"
          >
            @for (opcion of HORAS; track opcion) {
              <mat-option [value]="opcion">{{ enPunto(opcion) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <p role="status" aria-live="polite" class="text-sm">
          @if (error()) {
            <span class="text-destructive">{{ error() }}</span>
          }
        </p>
      }
    </section>
  `,
})
export class InformeDiario {
  private readonly api = inject(AdminCanchas);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly configuracion = resource({
    loader: () => this.api.configuracion(),
  });

  /** Lo que muestra cada control, sembrado con lo que dice el servidor. */
  protected readonly activo = linkedSignal(
    () => this.configuracion.value()?.informeDiarioActivo ?? true,
  );
  protected readonly hora = linkedSignal(() => this.configuracion.value()?.informeDiarioHora ?? 7);

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly HORAS = Array.from({ length: 24 }, (_, hora) => hora);
  protected readonly enPunto = enPunto;

  /** Lo que quedó, dicho según lo que se cambió: la hora de uno apagado también se guarda. */
  private loHecho(
    cambios: Partial<Pick<ConfiguracionDelClub, 'informeDiarioActivo'>>,
    guardada: ConfiguracionDelClub,
  ): string {
    const hora = enPunto(guardada.informeDiarioHora);

    if (cambios.informeDiarioActivo === false) return 'Guardado: el informe diario ya no sale.';
    return guardada.informeDiarioActivo
      ? `Guardado: el informe sale cada día a las ${hora}.`
      : `Guardado: cuando lo actives, saldrá a las ${hora}.`;
  }

  protected async guardar(
    cambios: Partial<Pick<ConfiguracionDelClub, 'informeDiarioActivo' | 'informeDiarioHora'>>,
  ): Promise<void> {
    this.error.set(null);
    this.guardando.set(true);

    try {
      const guardada = await this.api.fijarConfiguracion(cambios);
      this.activo.set(guardada.informeDiarioActivo);
      this.hora.set(guardada.informeDiarioHora);
      this.snackBar.open(this.loHecho(cambios, guardada), undefined, LO_HECHO);
    } catch (falla) {
      // El control vuelve a lo que estaba: lo guardado es lo del servidor.
      this.configuracion.reload();
      this.error.set(mensajeDelServidor(falla));
    } finally {
      this.guardando.set(false);
    }
  }
}
