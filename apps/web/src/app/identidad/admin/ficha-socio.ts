import {
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { proveerCampos } from '../../ui/campos';
import { fechaATexto, proveerFechaYHora, textoAFecha } from '../../ui/fecha-y-hora';
import { overlaysEnElDialogo } from '../../ui/overlays-en-el-dialogo';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import {
  CambiosDeFicha,
  EstadoSocio,
  SocioDelClub,
  Socios,
} from './socios.service';
import { Esqueleto } from '../../ui/esqueleto';
import { HistorialDeObservaciones } from '../../reservas/admin/historial-de-observaciones';

const ESTADOS: { valor: EstadoSocio; etiqueta: string }[] = [
  { valor: 'ACTIVO', etiqueta: 'Activo' },
  { valor: 'SUSPENDIDO', etiqueta: 'Suspendido' },
  { valor: 'RETIRADO', etiqueta: 'Retirado' },
];

/** Cómo se llama cada campo auditado en pantalla. El enum crudo no se muestra. */
const CAMPOS: Record<string, string> = {
  estado: 'Estado',
  alDiaHasta: 'Cuota al día hasta',
  numeroSocio: 'Número de socio',
  sancionadoHasta: 'Sanción',
};

/**
 * La ficha de un socio: editarla, y ver quién la cambió antes.
 *
 * **Las dos cosas van juntas y en la misma pantalla a propósito.** El historial
 * existe para que una decisión se pueda explicar, y el momento en que alguien
 * pregunta es justo cuando otra persona está por cambiar lo mismo.
 *
 * Componente aparte y no una sección más de `socios.ts`, que ya pasa de 400 líneas.
 */
@Component({
  selector: 'app-ficha-socio',
  imports: [
    MatSelectModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    Aviso,
    Esqueleto,
    HistorialDeObservaciones,
  ],
  providers: [proveerCampos(), proveerFechaYHora(), overlaysEnElDialogo()],
  template: `
    <dialog
      #dialogo
      closedby="any"
      class="m-auto w-[min(34rem,92vw)] rounded-2xl bg-card p-6 shadow-xl
             backdrop:bg-foreground/50"
      [attr.aria-label]="'Ficha de ' + socio().usuario.nombre"
      (close)="cerrado.emit()"
    >
      <h2 class="titular text-2xl">
        {{ socio().usuario.nombre }} {{ socio().usuario.apellido }}
      </h2>
      <p class="text-sm text-muted-foreground">{{ socio().usuario.email }}</p>

      <form class="mt-4 grid gap-3" (ngSubmit)="guardar()">
        <mat-form-field>
          <mat-label>Número de socio</mat-label>
          <input
            matInput
            name="numeroSocio"
            [(ngModel)]="borrador.numeroSocio"
          />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Estado</mat-label>
          <mat-select
            name="estado"
            [(ngModel)]="borrador.estado"
          >
            @for (opcion of ESTADOS; track opcion.valor) {
              <mat-option [value]="opcion.valor">{{ opcion.etiqueta }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Cuota al día hasta</mat-label>
          <input
            matInput
            id="cuota-al-dia-hasta"
            name="alDiaHasta"
            placeholder="dd-mm-aaaa"
            autocomplete="off"
            [matDatepicker]="calendarioAlDiaHasta"
            [(ngModel)]="borrador.alDiaHasta"
          />
          <mat-datepicker-toggle matIconSuffix [for]="calendarioAlDiaHasta" />
          <mat-datepicker #calendarioAlDiaHasta />
          <mat-hint>Es el último día en que puede reservar.</mat-hint>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Motivo</mat-label>
          <input matInput name="motivo" [(ngModel)]="motivo" />
          <mat-hint>Queda en el historial. Sin él, en seis meses nadie sabe por qué.</mat-hint>
        </mat-form-field>

        @if (error(); as falla) {
          <app-aviso variante="error">{{ falla }}</app-aviso>
        }

        <div class="flex flex-wrap justify-end gap-2">
          <button
            matButton
            type="button"
            (click)="dialogo.close()"
          >
            Cancelar
          </button>
          <button
            matButton="filled"
            type="submit"
            [disabled]="guardando()"
            [attr.aria-busy]="guardando()"
          >
            Guardar
          </button>
        </div>
      </form>

      <section class="mt-6 border-t border-border pt-4" aria-labelledby="historial">
        <h3 id="historial" class="subtitulo">Qué se le cambió</h3>

        @if (historial.isLoading()) {
          <app-esqueleto class="mt-2 block" [filas]="3" etiqueta="Cargando el historial…" />
        } @else if (historial.error()) {
          <p class="mt-2 text-sm text-destructive">
            No se pudo cargar el historial. Reintenta en un momento.
          </p>
        } @else if (historial.value().length === 0) {
          <p class="mt-2 text-sm text-muted-foreground">
            Nada desde que existe el registro.
          </p>
        } @else {
          <ul class="mt-2 grid gap-2 text-sm">
            @for (cambio of historial.value(); track cambio.id) {
              <li class="rounded-lg bg-muted p-2">
                <span class="font-medium">{{ nombreCampo(cambio.campo) }}</span>:
                {{ cambio.valorAnterior || 'sin valor' }} →
                <span class="font-medium">
                  {{ cambio.valorNuevo || 'sin valor' }}
                </span>
                <span class="block text-muted-foreground">
                  {{ cuando(cambio.hechoEn) }} · {{ cambio.hechoPorNombre }}
                  @if (cambio.motivo) {
                    · {{ cambio.motivo }}
                  }
                </span>
              </li>
            }
          </ul>
        }
      </section>

      <!-- Las notas del mesón sobre sus reservas (T226): las escriben el admin y el
           gestor, y el socio no las ve. Acá van todas, de la reserva más nueva. -->
      <section class="mt-6 border-t border-border pt-4" aria-labelledby="observaciones">
        <h3 id="observaciones" class="subtitulo">Observaciones del mesón</h3>
        <app-historial-de-observaciones class="mt-2 block" [socioId]="socio().id" />
      </section>
    </dialog>
  `,
})
export class FichaSocio {
  private readonly api = inject(Socios);

  readonly socio = input.required<SocioDelClub>();

  /** Se guardó algo: el panel recarga su lista. */
  readonly guardado = output<void>();
  readonly cerrado = output<void>();

  protected readonly ESTADOS = ESTADOS;

  protected readonly borrador = {
    numeroSocio: '',
    estado: 'ACTIVO' as EstadoSocio,
    /** Como la entrega el calendario de Material, y a texto al guardar (A5, T244). */
    alDiaHasta: null as Date | null,
  };
  protected motivo = '';

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly historial = resource({
    params: () => ({ id: this.socio().id }),
    loader: ({ params }) => this.api.historial(params.id),
    defaultValue: [],
  });

  private readonly dialogo =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    // El mismo patrón que `app-reservar`: `showModal()` y no el atributo `open`,
    // porque solo esa vuelve inerte el resto de la página y atrapa el foco. En un
    // efecto sobre el socio, para que abrir la ficha de otro sin cerrar la anterior
    // vuelva a mostrarla con los datos nuevos.
    effect(() => {
      const socio = this.socio();
      const elemento = this.dialogo().nativeElement;

      this.borrador.numeroSocio = socio.numeroSocio;
      this.borrador.estado = socio.estado;
      this.borrador.alDiaHasta = textoAFecha(socio.alDiaHasta.slice(0, 10));

      if (!elemento.open) elemento.showModal();
    });
  }

  protected nombreCampo(campo: string): string {
    return CAMPOS[campo] ?? campo;
  }

  protected cuando(instante: string): string {
    return new Date(instante).toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  /**
   * Manda solo lo que cambió.
   *
   * El servidor ya ignora los campos sin cambio —no deja renglón— pero mandarlos
   * igual haría que un error de otro campo hablara de algo que el admin no tocó.
   */
  protected async guardar(): Promise<void> {
    const socio = this.socio();
    const cambios: CambiosDeFicha = {};

    if (this.borrador.numeroSocio.trim() !== socio.numeroSocio) {
      cambios.numeroSocio = this.borrador.numeroSocio.trim();
    }
    if (this.borrador.estado !== socio.estado) cambios.estado = this.borrador.estado;
    const alDiaHasta = fechaATexto(this.borrador.alDiaHasta);
    if (alDiaHasta !== socio.alDiaHasta.slice(0, 10)) cambios.alDiaHasta = alDiaHasta;

    if (Object.keys(cambios).length === 0) {
      this.error.set('No cambiaste nada.');
      return;
    }

    if (this.motivo.trim()) cambios.motivo = this.motivo.trim();

    this.error.set(null);
    this.guardando.set(true);

    try {
      await this.api.editar(socio.id, cambios);
      this.guardado.emit();
      this.historial.reload();
      this.motivo = '';
    } catch (falla) {
      // El del servidor: "Ese número de socio ya es de otra persona" dice qué corregir.
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar la ficha.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
