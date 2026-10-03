import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import { Socios } from '../../identidad/admin/socios.service';
import { Aviso } from '../../ui/aviso';
import { Insignia } from '../../ui/insignia';
import { Selector } from '../../ui/selector';
import { Clases, Inscrito, QuienSeInscribe } from '../clases.service';

/**
 * Quién viene a una clase.
 *
 * **El cupo que muestra esta pantalla es una anticipación, no la regla.** Quien decide
 * es el servidor: dos personas apretando el último lugar a la vez —el mesón y el
 * teléfono— es el caso normal en un club chico, y la pantalla no puede saber lo que
 * pasó hace medio segundo. Por eso el botón sigue disponible hasta que el servidor
 * dice que no, y ese "no" se muestra con sus palabras.
 */
@Component({
  selector: 'app-inscritos',
  imports: [FormsModule, Aviso, Insignia, Selector],
  template: `
    @if (ficha.value(); as clase) {
      <div class="mt-3 rounded-xl border border-border bg-background p-4">
        <div class="flex flex-wrap items-baseline gap-2">
          <h3 class="subtitulo">Quién viene</h3>
          <app-insignia
            [variante]="clase.cupoTomado >= clase.cupoMaximo ? 'aviso' : 'neutro'"
            icono="group"
          >
            {{ clase.cupoTomado }} de {{ clase.cupoMaximo }}
          </app-insignia>
        </div>

        @if (error(); as falla) {
          <app-aviso variante="error" class="mt-2 block">{{ falla }}</app-aviso>
        }

        @if (clase.inscritos.length === 0) {
          <p class="mt-2 text-sm text-muted-foreground">
            Todavía no hay nadie inscrito.
          </p>
        } @else {
          <ul class="mt-2 grid gap-2">
            @for (quien of clase.inscritos; track quien.id) {
              <li class="flex flex-wrap items-center gap-2 text-sm">
                <span
                  class="font-medium"
                  [class.line-through]="quien.estado === 'CANCELADA'"
                >
                  {{ quien.nombre }}
                </span>

                @if (quien.esSocio) {
                  <app-insignia variante="info" icono="badge">
                    Socio {{ quien.numeroSocio }}
                  </app-insignia>
                } @else {
                  <app-insignia variante="neutro" icono="person">Alumno</app-insignia>
                }

                @if (quien.telefono) {
                  <a class="underline" [href]="'tel:' + quien.telefono">
                    {{ quien.telefono }}
                  </a>
                }

                @if (quien.estado === 'CANCELADA') {
                  <span class="text-muted-foreground">Se bajó</span>
                } @else if (quien.estado === 'ASISTIO') {
                  <app-insignia variante="exito" icono="check_circle">Vino</app-insignia>
                } @else if (quien.estado === 'FALTO') {
                  <app-insignia variante="aviso" icono="cancel">No vino</app-insignia>
                } @else {
                  <label class="ms-auto flex items-center gap-1">
                    <input
                      type="checkbox"
                      class="size-4"
                      [checked]="vinieron().has(quien.id)"
                      (change)="marcar(quien.id, $any($event.target).checked)"
                    />
                    <span class="text-sm">Vino</span>
                  </label>
                  <button
                    type="button"
                    class="boton boton-texto boton-chico"
                    [disabled]="trabajando()"
                    (click)="bajar(quien)"
                  >
                    Sacar de la clase
                  </button>
                }
              </li>
            }
          </ul>
        }

        <!-- A una clase que ya se dio no se inscribe a nadie: el servidor lo rechaza
             y el formulario solo serviría para descubrirlo apretando. -->
        @if (clase.estado === 'PROGRAMADA') {
        <form class="mt-3 border-t border-border pt-3" (ngSubmit)="inscribir()">
          <app-selector
            etiqueta="A quién se inscribe"
            [opciones]="TIPOS"
            [(valor)]="tipo"
          />

          <div class="mt-2 flex flex-wrap items-end gap-2">
            @if (tipo() === 'socio') {
              <label class="flex-1">
                <span class="text-sm font-medium">Socio</span>
                <select class="campo campo-chico mt-1" name="socioId" [(ngModel)]="socioId">
                  <option [value]="0" disabled>Elige un socio</option>
                  @for (socio of sociosPorInscribir(); track socio.id) {
                    <option [value]="socio.id">
                      {{ socio.numeroSocio }} · {{ socio.usuario.nombre }}
                      {{ socio.usuario.apellido }}
                    </option>
                  }
                </select>
              </label>
            } @else {
              <label class="flex-1">
                <span class="text-sm font-medium">Nombre del alumno</span>
                <input class="campo campo-chico mt-1" name="nombre" [(ngModel)]="nombre" />
              </label>
              <label class="flex-1">
                <span class="text-sm font-medium">Teléfono</span>
                <input
                  class="campo campo-chico mt-1"
                  type="tel"
                  name="telefono"
                  [(ngModel)]="telefono"
                />
              </label>
            }

            <button type="submit" class="boton boton-secundario boton-chico" [disabled]="trabajando()">
              Inscribir
            </button>
          </div>

          @if (clase.estado === 'PROGRAMADA' && clase.inscritos.length > 0) {
            <!-- Dos botones y no uno con una casilla: cerrar sin pasar lista y cerrar
                 diciendo que no vino nadie son cosas distintas, y con un solo botón
                 la lista vacía significaría las dos. -->
            <div class="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="button"
                class="boton boton-secundario boton-chico"
                [disabled]="trabajando()"
                (click)="cerrar(true)"
              >
                Cerrar la clase con esta lista
              </button>
              <button
                type="button"
                class="boton boton-texto boton-chico"
                [disabled]="trabajando()"
                (click)="cerrar(false)"
              >
                Cerrar sin pasar lista
              </button>
            </div>
          }

          @if (lleno()) {
            <!-- No deshabilita el botón: quien decide es el servidor, y entre esta
                 pantalla y el clic alguien pudo bajarse. -->
            <p class="mt-2 text-sm text-muted-foreground">
              La clase está llena. Si alguien se baja, se libera el lugar.
            </p>
          }
        </form>
        }
      </div>
    }
  `,
})
export class InscritosDeLaClase {
  private readonly api = inject(Clases);
  private readonly sociosApi = inject(Socios);

  readonly claseId = input.required<number>();

  protected readonly tipo = signal('socio');
  protected readonly TIPOS = [
    { valor: 'socio', etiqueta: 'Un socio' },
    { valor: 'alumno', etiqueta: 'Alumno de afuera' },
  ];

  protected socioId = 0;
  protected nombre = '';
  protected telefono = '';

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly ficha = resource({
    params: () => ({ id: this.claseId(), version: this.version() }),
    loader: ({ params }) => this.api.ficha(params.id),
  });

  protected readonly socios = resource({ loader: () => this.sociosApi.listado() });

  /**
   * Los que todavía no están en esta clase.
   *
   * Elegir a alguien que ya está inscrito responde 409 con un mensaje claro, pero
   * sigue siendo un callejón: la lista lo ofrece y el servidor lo rechaza siempre.
   * Es el mismo criterio de las canchas desactivadas en la pantalla de agendar.
   */
  protected readonly sociosPorInscribir = computed(() => {
    const yaEstan = new Set(
      (this.ficha.value()?.inscritos ?? [])
        .filter((quien) => quien.estado !== 'CANCELADA')
        .map((quien) => quien.numeroSocio),
    );

    return (this.socios.value()?.socios ?? []).filter(
      (socio) => !yaEstan.has(socio.numeroSocio),
    );
  });

  protected readonly lleno = computed(() => {
    const clase = this.ficha.value();

    return clase !== undefined && clase.cupoTomado >= clase.cupoMaximo;
  });

  protected async inscribir(): Promise<void> {
    const quien: QuienSeInscribe =
      this.tipo() === 'socio'
        ? { socioId: Number(this.socioId) }
        : { nombre: this.nombre, telefono: this.telefono };

    await this.intentar(async () => {
      await this.api.inscribir(this.claseId(), quien);
      this.socioId = 0;
      this.nombre = '';
      this.telefono = '';
    });
  }

  /** Quiénes vinieron, mientras el club pasa lista y todavía no cierra. */
  protected readonly vinieron = signal(new Set<number>());

  protected marcar(id: number, vino: boolean): void {
    this.vinieron.update((actual) => {
      const copia = new Set(actual);
      if (vino) copia.add(id);
      else copia.delete(id);

      return copia;
    });
  }

  /**
   * Cierra la clase.
   *
   * `conLista` en `false` la deja realizada sin tocar a nadie: la asistencia es un
   * dato que el club lleva si quiere, no un trámite que bloquea cerrar la clase.
   */
  protected async cerrar(conLista: boolean): Promise<void> {
    await this.intentar(async () => {
      await this.api.realizar(
        this.claseId(),
        conLista ? [...this.vinieron()] : null,
      );
      this.vinieron.set(new Set());
    });
  }

  protected async bajar(quien: Inscrito): Promise<void> {
    await this.intentar(() => this.api.bajar(this.claseId(), quien.id));
  }

  private async intentar(accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si la clase está llena, si ese socio ya está o si
      // falta el teléfono del alumno.
      this.error.set(mensajeDelServidor(falla, 'No se pudo inscribir.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
