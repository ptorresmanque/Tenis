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

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Campo, CampoControl } from '../../ui/campo';
import {
  CambiosDeFicha,
  EstadoSocio,
  SocioDelClub,
  Socios,
} from './socios.service';
import { CampoFecha } from '../../ui/campo-fecha';

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
  imports: [FormsModule, Aviso, Campo, CampoControl, CampoFecha],
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
        <app-campo etiqueta="Número de socio">
          <input
            appCampoControl
            name="numeroSocio"
            class="campo"
            [(ngModel)]="borrador.numeroSocio"
          />
        </app-campo>

        <app-campo etiqueta="Estado">
          <select
            appCampoControl
            name="estado"
            class="campo"
            [(ngModel)]="borrador.estado"
          >
            @for (opcion of ESTADOS; track opcion.valor) {
              <option [value]="opcion.valor">{{ opcion.etiqueta }}</option>
            }
          </select>
        </app-campo>

        <!-- Sin app-campo: su <label> envolvería el campo, y Material deja el calendario
             adentro (T126). Las mismas clases que app-campo. -->
        <div class="grid gap-1.5">
          <label class="text-sm font-semibold" for="cuota-al-dia-hasta">Cuota al día hasta</label>
          <app-campo-fecha
            inputId="cuota-al-dia-hasta"
            name="alDiaHasta"
            describedBy="cuota-al-dia-hasta-ayuda"
            [(ngModel)]="borrador.alDiaHasta"
          />
          <span id="cuota-al-dia-hasta-ayuda" class="text-xs text-muted-foreground">
            Es el último día en que puede reservar.
          </span>
        </div>

        <app-campo
          etiqueta="Motivo"
          ayuda="Queda en el historial. Sin él, en seis meses nadie sabe por qué."
        >
          <input appCampoControl name="motivo" class="campo" [(ngModel)]="motivo" />
        </app-campo>

        @if (error(); as falla) {
          <app-aviso variante="error">{{ falla }}</app-aviso>
        }

        <div class="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            class="boton boton-texto"
            (click)="dialogo.close()"
          >
            Cancelar
          </button>
          <button type="submit" class="boton boton-primario" [disabled]="guardando()">
            Guardar
          </button>
        </div>
      </form>

      <section class="mt-6 border-t border-border pt-4" aria-labelledby="historial">
        <h3 id="historial" class="subtitulo">Qué se le cambió</h3>

        @if (historial.isLoading()) {
          <p class="mt-2 text-sm text-muted-foreground">Cargando…</p>
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
    alDiaHasta: '',
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
      this.borrador.alDiaHasta = socio.alDiaHasta.slice(0, 10);

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
    if (this.borrador.alDiaHasta !== socio.alDiaHasta.slice(0, 10)) {
      cambios.alDiaHasta = this.borrador.alDiaHasta;
    }

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
