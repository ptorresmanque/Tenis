import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { enPesos } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { Profesor, Profesores } from '../profesores.service';

/** El formulario vacío. Función y no constante: si no, todos comparten el objeto. */
const enBlanco = () => ({
  nombreVisible: '',
  telefono: '',
  especialidad: '',
  tarifaHoraClp: null as number | null,
});

/**
 * Quiénes dan clases en el club.
 *
 * **Desactivar es el borrar de esta pantalla**, y por eso no hay botón de borrar. Un
 * profesor que se fue dio clases que pasaron: borrarlo se llevaría por delante quién
 * las dio. Desactivado deja de aparecer para agendar y su historia queda donde estaba.
 *
 * Un solo formulario para dar de alta y para editar: son el mismo puñado de campos, y
 * dos formularios distintos serían dos lugares donde arreglar lo mismo.
 */
@Component({
  selector: 'app-profesores',
  imports: [FormsModule, Aviso, EstadoVacio, Insignia],
  template: `
    <h1 class="font-display text-3xl font-bold">Profesores</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Quiénes dan clases, cómo se anuncian y por dónde los llama el club cuando una
      clase se mueve.
    </p>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }
    @if (aviso(); as texto) {
      <app-aviso variante="exito" class="mt-4 block">{{ texto }}</app-aviso>
    }

    <form
      class="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm"
      (ngSubmit)="guardar()"
    >
      <h2 class="font-display text-lg font-semibold">
        {{ editando() ? 'Editar ficha' : 'Anotar un profesor' }}
      </h2>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium">Cómo se anuncia</span>
          <input
            class="campo mt-1"
            name="nombreVisible"
            required
            placeholder="Ana Silva"
            [(ngModel)]="datos.nombreVisible"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Teléfono</span>
          <input
            class="campo mt-1"
            name="telefono"
            type="tel"
            required
            placeholder="+56912345678"
            [(ngModel)]="datos.telefono"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Especialidad</span>
          <input
            class="campo mt-1"
            name="especialidad"
            required
            placeholder="Iniciación, Competitivo, Niños"
            [(ngModel)]="datos.especialidad"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Tarifa por hora</span>
          <input
            class="campo mt-1"
            name="tarifaHoraClp"
            type="number"
            min="0"
            step="1000"
            placeholder="Opcional"
            [(ngModel)]="datos.tarifaHoraClp"
          />
          <span class="text-sm text-muted-foreground">
            Lo que el club le paga. No se publica.
          </span>
        </label>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <button type="submit" class="boton boton-primario" [disabled]="trabajando()">
          {{ editando() ? 'Guardar cambios' : 'Anotar profesor' }}
        </button>
        @if (editando()) {
          <button type="button" class="boton boton-texto" (click)="cancelar()">
            Cancelar
          </button>
        }
      </div>
    </form>

    @if (profesores.isLoading()) {
      <p class="mt-4 text-muted-foreground">Cargando…</p>
    } @else if (profesores.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="sports_tennis"
        titulo="Todavía no hay profesores"
        detalle="Anota al primero con el formulario de arriba."
      />
    } @else {
      <ul class="mt-4 grid gap-3">
        @for (profesor of profesores.value(); track profesor.id) {
          <li
            class="flex flex-wrap items-center gap-3 rounded-xl border border-border
                   bg-card p-4 shadow-sm"
          >
            <div class="min-w-0 flex-1">
              <p class="font-display text-lg font-semibold">
                {{ profesor.nombreVisible }}
              </p>
              <p class="text-sm text-muted-foreground">
                {{ profesor.especialidad }} ·
                <a [href]="'tel:' + profesor.telefono" class="underline">
                  {{ profesor.telefono }}
                </a>
                @if (profesor.tarifaHoraClp !== null) {
                  · {{ pesos(profesor.tarifaHoraClp) }} la hora
                }
              </p>
            </div>

            @if (profesor.activo) {
              <app-insignia variante="exito" icono="check_circle">
                Dando clases
              </app-insignia>
            } @else {
              <app-insignia variante="neutro" icono="pause_circle">
                Desactivado
              </app-insignia>
            }

            <button
              type="button"
              class="boton boton-secundario boton-chico"
              [disabled]="trabajando()"
              (click)="editar(profesor)"
            >
              Editar
            </button>
            <button
              type="button"
              class="boton boton-texto boton-chico"
              [disabled]="trabajando()"
              (click)="cambiarActividad(profesor)"
            >
              {{ profesor.activo ? 'Desactivar' : 'Reactivar' }}
            </button>
          </li>
        }
      </ul>

      <p class="mt-4 text-sm text-muted-foreground">
        Desactivar no borra la ficha: el profesor deja de aparecer para agendar clases
        nuevas y las que ya dio siguen siendo suyas.
      </p>
    }
  `,
})
export class ProfesoresPanel {
  private readonly api = inject(Profesores);

  protected readonly editando = signal<number | null>(null);
  protected datos = enBlanco();

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly profesores = resource({
    params: () => this.version(),
    loader: () => this.api.listar(),
    defaultValue: [] as Profesor[],
  });

  protected readonly pesos = enPesos;

  protected editar(profesor: Profesor): void {
    this.editando.set(profesor.id);
    this.datos = {
      nombreVisible: profesor.nombreVisible,
      telefono: profesor.telefono,
      especialidad: profesor.especialidad,
      tarifaHoraClp: profesor.tarifaHoraClp,
    };
  }

  protected cancelar(): void {
    this.editando.set(null);
    this.datos = enBlanco();
  }

  protected async guardar(): Promise<void> {
    const id = this.editando();
    // Una copia y no el objeto: el formulario lo sigue editando después de mandarlo.
    const ficha = { ...this.datos };

    await this.intentar(async () => {
      if (id === null) {
        await this.api.crear(ficha);
        this.aviso.set(`${ficha.nombreVisible} ya está en la lista.`);
      } else {
        await this.api.editar(id, ficha);
        this.aviso.set(`La ficha de ${ficha.nombreVisible} quedó actualizada.`);
      }

      this.cancelar();
    });
  }

  protected async cambiarActividad(profesor: Profesor): Promise<void> {
    await this.intentar(async () => {
      await this.api.editar(profesor.id, { activo: !profesor.activo });
      this.aviso.set(
        profesor.activo
          ? `${profesor.nombreVisible} no aparecerá para agendar clases nuevas.`
          : `${profesor.nombreVisible} vuelve a estar disponible.`,
      );
    });
  }

  private async intentar(accion: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice cuál de los campos falta.
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar la ficha.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
