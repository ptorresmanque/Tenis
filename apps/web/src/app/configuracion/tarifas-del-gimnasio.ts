import { Component, inject, linkedSignal, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { proveerCampos } from '../ui/campos';
import { AdminCanchas } from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { LO_HECHO } from '../ui/material';

/** Lo mismo que valida la API: es un bloque de la portada, no un tarifario. */
const TARIFAS_MAXIMAS = 10;

/** Una fila mientras se escribe: los montos, como texto, para saber cuál quedó en blanco. */
interface Fila {
  nombre: string;
  socio: string;
  noSocio: string;
}

/** En blanco viaja nulo, y el servidor dice cuál falta; `Number('')` sería un cero callado. */
const monto = (texto: string) => (texto.trim() === '' ? null : Number(texto));

/**
 * Las tarifas del gimnasio (T236): filas de nombre, precio socio y precio no socio, que se
 * agregan, se quitan y **se guardan todas juntas**, en el orden de la pantalla, que es el
 * del sitio.
 *
 * **Lee las guardadas con su propio pedido, y no deja guardar hasta tenerlas**: una lista
 * que todavía viaja se ve vacía, y guardarla borraría las del club.
 */
@Component({
  selector: 'app-tarifas-del-gimnasio',
  imports: [MatFormFieldModule, MatInput, MatButton, Aviso],
  providers: [proveerCampos()],
  host: { class: 'block' },
  template: `
    <h2 class="rotulo-seccion mt-10">Tarifas</h2>
    <p class="mt-2 max-w-prose text-sm text-muted-foreground">
      Salen en la portada y en «El club», en este orden. Se muestran y no se cobran: las clases se
      pagan en el mesón.
    </p>

    @if (guardadas.error()) {
      <app-aviso variante="error" class="mt-3 block">
        No se pudieron cargar las tarifas. Reintenta en un momento.
      </app-aviso>
    }

    <form class="mt-4 grid max-w-xl gap-4" (submit)="guardar($event)">
      @for (fila of filas(); track $index; let i = $index) {
        <fieldset class="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_7rem_7rem]">
          <legend class="font-display text-sm font-bold tracking-wide uppercase">
            Tarifa {{ i + 1 }}
          </legend>

          <mat-form-field>
            <mat-label>Nombre</mat-label>
            <input
              matInput
              maxlength="80"
              placeholder="Clase grupal"
              [value]="fila.nombre"
              (input)="cambiar(i, 'nombre', $event)"
            />
          </mat-form-field>

          <mat-form-field>
            <mat-label>Socio</mat-label>
            <span matTextPrefix>$&nbsp;</span>
            <input
              matInput
              type="number"
              min="0"
              step="1"
              [value]="fila.socio"
              (input)="cambiar(i, 'socio', $event)"
            />
          </mat-form-field>

          <mat-form-field>
            <mat-label>No socio</mat-label>
            <span matTextPrefix>$&nbsp;</span>
            <input
              matInput
              type="number"
              min="0"
              step="1"
              [value]="fila.noSocio"
              (input)="cambiar(i, 'noSocio', $event)"
            />
          </mat-form-field>

          <button
            matButton
            type="button"
            class="chico justify-self-start sm:col-span-3"
            (click)="quitar(i)"
          >
            Quitar <span class="sr-only">la tarifa {{ i + 1 }}</span>
          </button>
        </fieldset>
      } @empty {
        <p class="text-sm text-muted-foreground">Todavía no tiene tarifas.</p>
      }

      <div class="flex flex-wrap items-center gap-3">
        <button
          matButton="outlined"
          type="button"
          [disabled]="filas().length >= TARIFAS_MAXIMAS"
          (click)="agregar()"
        >
          Agregar una tarifa
        </button>
        @if (filas().length >= TARIFAS_MAXIMAS) {
          <p class="text-sm text-muted-foreground">Ya tiene diez, el máximo.</p>
        }
      </div>

      @if (error(); as falla) {
        <app-aviso variante="error">{{ falla }}</app-aviso>
      }

      <div>
        <button
          matButton="filled"
          type="submit"
          [disabled]="guardando() || !guardadas.hasValue()"
          [attr.aria-busy]="guardando()"
        >
          {{ guardando() ? 'Guardando…' : 'Guardar las tarifas' }}
        </button>
      </div>
    </form>
  `,
})
export class TarifasDelGimnasio {
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(AdminCanchas);
  /** Los datos que lee el sitio público, para que muestre lo recién guardado. */
  private readonly sitio = inject(Club);

  protected readonly TARIFAS_MAXIMAS = TARIFAS_MAXIMAS;

  protected readonly guardadas = resource({ loader: () => this.api.tarifasDelGimnasio() });

  /** Las filas en pantalla: arrancan de las guardadas y vuelven a ellas al guardar. */
  protected readonly filas = linkedSignal<Fila[]>(() =>
    (this.guardadas.hasValue() ? this.guardadas.value() : []).map((tarifa) => ({
      nombre: tarifa.nombre,
      socio: String(tarifa.precioSocioClp),
      noSocio: String(tarifa.precioNoSocioClp),
    })),
  );

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected cambiar(posicion: number, campo: keyof Fila, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;

    this.filas.update((filas) =>
      filas.map((fila, i) => (i === posicion ? { ...fila, [campo]: valor } : fila)),
    );
  }

  protected agregar(): void {
    this.filas.update((filas) => [...filas, { nombre: '', socio: '', noSocio: '' }]);
  }

  protected quitar(posicion: number): void {
    this.filas.update((filas) => filas.filter((_, i) => i !== posicion));
  }

  protected async guardar(evento: Event): Promise<void> {
    evento.preventDefault();
    this.error.set(null);
    this.guardando.set(true);

    try {
      await this.api.guardarTarifasDelGimnasio(
        this.filas().map((fila) => ({
          nombre: fila.nombre,
          precioSocioClp: monto(fila.socio),
          precioNoSocioClp: monto(fila.noSocio),
        })),
      );
      this.guardadas.reload();
      this.sitio.recargar();
      this.snackBar.open('Guardadas. La portada y «El club» ya las muestran.', undefined, LO_HECHO);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudieron guardar las tarifas.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
