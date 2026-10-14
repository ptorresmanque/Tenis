import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { errorDelCampo, proveerCampos } from '../../ui/campos';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Insignia } from '../../ui/insignia';
import { Clases, Inscrito, QuienSeInscribe } from '../clases.service';
import { EnlaceTelefonoPipe, TelefonoPipe } from '../../core/telefono';
import { TelefonoDirective } from '../../ui/telefono';
import { Esqueleto } from '../../ui/esqueleto';
import { LO_HECHO } from '../../ui/material';

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
  imports: [
    MatCheckbox,
    MatSelectModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    Aviso,
    Esqueleto,
    Insignia,
    MatButtonToggleModule,
    EnlaceTelefonoPipe,
    TelefonoPipe,
    TelefonoDirective,
  ],
  providers: [proveerCampos()],
  template: `
    @if (ficha.error()) {
      <p class="mt-3 text-sm text-destructive">
        No se pudieron cargar los inscritos de la clase. Reintenta en un momento.
      </p>
    } @else if (ficha.status() === 'loading') {
      <app-esqueleto class="mt-4 block" [filas]="4" etiqueta="Cargando los inscritos…" />
    } @else if (ficha.value(); as clase) {
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
          <p class="mt-2 text-sm text-muted-foreground">Todavía no hay nadie inscrito.</p>
        } @else {
          <ul class="mt-2 grid gap-2">
            @for (quien of clase.inscritos; track quien.id) {
              <li class="flex flex-wrap items-center gap-2 text-sm">
                <span class="font-medium" [class.line-through]="quien.estado === 'CANCELADA'">
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
                  <a class="underline" [href]="quien.telefono | enlaceTelefono">
                    {{ quien.telefono | telefono }}
                  </a>
                }

                @if (quien.estado === 'CANCELADA') {
                  <span class="text-muted-foreground">Se bajó</span>
                } @else if (quien.estado === 'ASISTIO') {
                  <app-insignia variante="exito" icono="check_circle">Vino</app-insignia>
                } @else if (quien.estado === 'FALTO') {
                  <app-insignia variante="aviso" icono="cancel">No vino</app-insignia>
                } @else {
                  <mat-checkbox
                    class="ms-auto text-sm"
                    [checked]="vinieron().has(quien.id)"
                    (change)="marcar(quien.id, $event.checked)"
                  >
                    Vino
                  </mat-checkbox>
                  <button
                    matButton
                    type="button"
                    class="chico"
                    [disabled]="trabajando()"
                    [attr.aria-busy]="enCurso() === 'bajar-' + quien.id"
                    (click)="bajar(quien)"
                  >
                    Sacar de la clase
                  </button>
                  <!-- T116. Saca de esta y de las que vienen: las que ya pasaron quedan
                       con su asistencia. -->
                  @if (clase.serieId !== null) {
                    <button
                      matButton
                      type="button"
                      class="chico"
                      [disabled]="trabajando()"
                      [attr.aria-busy]="enCurso() === 'sacarDeLaSerie-' + quien.id"
                      (click)="sacarDeLaSerie(clase.serieId, quien)"
                    >
                      Sacar de la serie
                    </button>
                  }
                }
              </li>
            }
          </ul>
        }

        <!-- A una clase que ya se dio no se inscribe a nadie: el servidor lo rechaza
             y el formulario solo serviría para descubrirlo apretando. -->
        @if (clase.estado === 'PROGRAMADA') {
          <form class="mt-3 border-t border-border pt-3" (ngSubmit)="inscribir()">
            <mat-button-toggle-group
              aria-label="A quién se inscribe"
              hideSingleSelectionIndicator
              [value]="tipo()"
              (change)="tipo.set($event.value)"
            >
              @for (opcion of TIPOS; track opcion.valor) {
                <mat-button-toggle [value]="opcion.valor">
                  {{ opcion.etiqueta }}
                </mat-button-toggle>
              }
            </mat-button-toggle-group>

            <div class="mt-2 flex flex-wrap items-end gap-2">
              @if (tipo() === 'socio') {
                <mat-form-field class="chico flex-1">
                  <mat-label>Socio</mat-label>
                  <mat-select name="socioId" [(ngModel)]="socioId">
                    <mat-option [value]="0" disabled>Elige un socio</mat-option>
                    @for (socio of sociosPorInscribir(); track socio.id) {
                      <mat-option [value]="socio.id">
                        {{ socio.numeroSocio }} · {{ socio.nombre }}
                      </mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              } @else {
                <mat-form-field class="chico flex-1">
                  <mat-label>Nombre del alumno</mat-label>
                  <input matInput name="nombre" [(ngModel)]="nombre" />
                </mat-form-field>
                <mat-form-field class="chico flex-1">
                  <mat-label>Teléfono</mat-label>
                  <span matTextPrefix>+56&nbsp;</span>
                  <input
                    matInput
                    appTelefono
                    #telefono="ngModel"
                    name="telefono"
                    [(ngModel)]="telefono"
                  />
                  <mat-error>{{ errorDelCampo(telefono.control) }}</mat-error>
                </mat-form-field>
              }

              <button
                matButton="outlined"
                type="submit"
                class="chico"
                [attr.aria-busy]="enCurso() === 'inscribir'"
                [disabled]="trabajando()"
              >
                Inscribir
              </button>
              <!-- T116. En cada clase que viene de la serie, en una transacción: si alguna
                 está llena, el servidor no inscribe en ninguna y dice cuál. -->
              @if (clase.serieId !== null) {
                <button
                  matButton="outlined"
                  type="button"
                  class="chico"
                  [disabled]="trabajando()"
                  [attr.aria-busy]="enCurso() === 'inscribirEnLaSerie-' + clase.serieId"
                  (click)="inscribirEnLaSerie(clase.serieId)"
                >
                  Inscribir en toda la serie
                </button>
              }
            </div>

            @if (clase.estado === 'PROGRAMADA' && clase.inscritos.length > 0) {
              <!-- Dos botones y no uno con una casilla: cerrar sin pasar lista y cerrar
                 diciendo que no vino nadie son cosas distintas, y con un solo botón
                 la lista vacía significaría las dos. -->
              <div class="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  matButton="outlined"
                  type="button"
                  class="chico"
                  [disabled]="trabajando()"
                  [attr.aria-busy]="enCurso() === 'cerrar-true'"
                  (click)="cerrar(true)"
                >
                  Cerrar la clase con esta lista
                </button>
                <button
                  matButton
                  type="button"
                  class="chico"
                  [disabled]="trabajando()"
                  [attr.aria-busy]="enCurso() === 'cerrar-false'"
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
  protected readonly errorDelCampo = errorDelCampo;

  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(Clases);

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
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly ficha = resource({
    params: () => ({ id: this.claseId(), version: this.version() }),
    loader: ({ params }) => this.api.ficha(params.id),
  });

  /**
   * Los socios para elegir, sin el padrón: el profesor no ve correos, teléfonos ni
   * deudas, y el admin tampoco los necesita para inscribir (T222).
   */
  protected readonly socios = resource({ loader: () => this.api.socios() });

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

    // Si la lista no cargó, el selector queda vacío y la clase se ve igual.
    return (this.socios.hasValue() ? this.socios.value() : []).filter(
      (socio) => !yaEstan.has(socio.numeroSocio),
    );
  });

  protected readonly lleno = computed(() => {
    const clase = this.ficha.value();

    return clase !== undefined && clase.cupoTomado >= clase.cupoMaximo;
  });

  protected async inscribir(): Promise<void> {
    const quien = this.quienSeInscribe();

    await this.intentar('inscribir', async () => {
      await this.api.inscribir(this.claseId(), quien);
      this.limpiarFormulario();
    });
  }

  /** En cada clase que viene de la serie (T116). */
  protected async inscribirEnLaSerie(serieId: number): Promise<void> {
    const quien = this.quienSeInscribe();

    await this.intentar(`inscribirEnLaSerie-${serieId}`, async () => {
      const { inscritas, yaEstaba } = await this.api.inscribirEnLaSerie(serieId, quien);
      this.limpiarFormulario();
      this.snackBar.open(
        `Inscrito en ${inscritas} ${inscritas === 1 ? 'clase' : 'clases'} de la serie` +
          (yaEstaba > 0 ? `; en ${yaEstaba} ya estaba.` : '.'),
        undefined,
        LO_HECHO,
      );
    });
  }

  /**
   * Lo saca de la serie: el socio por su ficha, el alumno de afuera por su nombre y su
   * teléfono, que es como lo reconoce el servidor.
   */
  protected async sacarDeLaSerie(serieId: number, quien: Inscrito): Promise<void> {
    const persona: QuienSeInscribe =
      quien.socioId !== null
        ? { socioId: quien.socioId }
        : { nombre: quien.nombre, telefono: quien.telefono };

    // Por inscrito y no por serie: la serie es la misma en todas las filas.
    await this.intentar(`sacarDeLaSerie-${quien.id}`, async () => {
      const { canceladas } = await this.api.salirDeLaSerie(serieId, persona);
      this.snackBar.open(
        `Salió de la serie: se ${canceladas === 1 ? 'canceló 1 clase que venía' : `cancelaron ${canceladas} clases que venían`}.`,
        undefined,
        LO_HECHO,
      );
    });
  }

  private quienSeInscribe(): QuienSeInscribe {
    return this.tipo() === 'socio'
      ? { socioId: Number(this.socioId) }
      : { nombre: this.nombre, telefono: this.telefono };
  }

  private limpiarFormulario(): void {
    this.socioId = 0;
    this.nombre = '';
    this.telefono = '';
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
    await this.intentar(`cerrar-${conLista}`, async () => {
      await this.api.realizar(this.claseId(), conLista ? [...this.vinieron()] : null);
      this.vinieron.set(new Set());
    });
  }

  protected async bajar(quien: Inscrito): Promise<void> {
    await this.intentar(`bajar-${quien.id}`, () => this.api.bajar(this.claseId(), quien.id));
  }

  private async intentar(clave: string, accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si la clase está llena, si ese socio ya está o si
      // falta el teléfono del alumno.
      this.error.set(mensajeDelServidor(falla, 'No se pudo inscribir.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}
