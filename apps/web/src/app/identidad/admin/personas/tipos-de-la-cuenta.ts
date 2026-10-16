import { Component, computed, effect, inject, input, output, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';

import { FichaNueva, Profesores } from '../../../clases/profesores.service';
import { Auth } from '../../../core/auth/auth';
import { mensajeDelServidor } from '../../../core/errores';
import { errorDelCampo, proveerCampos } from '../../../ui/campos';
import { confirmar } from '../../../ui/dialogo-de-confirmacion';
import { fechaATexto, proveerFechaYHora } from '../../../ui/fecha-y-hora';
import { LO_HECHO } from '../../../ui/material';
import { TelefonoDirective } from '../../../ui/telefono';
import { Socios } from '../socios.service';
import { FichaDeCuenta, Usuarios } from '../usuarios.service';

/** Dónde puede fallar «Guardar»: cada error va junto a su casilla (A6). */
type Paso = 'tipos' | 'socio' | 'profesor';

/**
 * Los tipos de una cuenta (T298, SPEC-panel.md D3 y A6): Socio, Profesor, Gestor y
 * Administrador, en casillas con un «Guardar». Reemplaza los botones «Hacer socio» y «Hacer
 * profesor» y los interruptores de admin y gestor de Usuarios.
 *
 * **Guardar aplica cada cambio con su endpoint de siempre, en orden**: gestor y admin, después
 * socio, después profesor. Cada uno es independiente: si uno falla, lo dice junto a su casilla
 * y los demás siguen; lo que se guardó queda guardado.
 *
 * - **Socio solo se marca.** Crea la ficha al tiro, con el alta de siempre (la cuenta ya
 *   existe, D12). Se da de baja cambiando su estado a Retirado en «Cuota»: sus reservas y sus
 *   cuotas se conservan.
 * - **Profesor** crea la ficha con la cuenta, reactiva la suya si estaba desactivada, o asocia
 *   una ficha de antes que no tenía cuenta (D14), que conserva sus clases. **Quitarlo
 *   desactiva la ficha** y no la suelta de la cuenta; con clases por venir, pregunta antes.
 */
@Component({
  selector: 'app-tipos-de-la-cuenta',
  imports: [
    MatButton,
    MatCheckbox,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatSelectModule,
    FormsModule,
    TelefonoDirective,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <form class="grid max-w-2xl gap-6" (ngSubmit)="guardar()">
      <section data-tipo="socio">
        <mat-checkbox name="socio" [disabled]="!!cuenta().socio" [(ngModel)]="borrador.socio">
          Socio
        </mat-checkbox>
        @if (cuenta().socio; as socio) {
          <p class="ms-10 text-sm text-muted-foreground">
            Socio N° {{ socio.numeroSocio }}. Para darlo de baja, cambia su estado a Retirado en
            «Cuota»: sus reservas y sus cuotas se conservan.
          </p>
        } @else if (borrador.socio) {
          <div class="ms-10 mt-2 grid gap-3 sm:grid-cols-2">
            <mat-form-field>
              <mat-label>N° de socio</mat-label>
              <input matInput name="numeroSocio" autocomplete="off" [(ngModel)]="borrador.numeroSocio" />
              <mat-hint>Sin número, el siguiente libre</mat-hint>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Al día hasta</mat-label>
              <input
                matInput
                name="alDiaHasta"
                autocomplete="off"
                [matDatepicker]="calendarioAlDia"
                [(ngModel)]="borrador.alDiaHasta"
              />
              <mat-datepicker-toggle matIconSuffix [for]="calendarioAlDia" />
              <mat-datepicker #calendarioAlDia>
                <mat-datepicker-actions>
                  <button matButton type="button" matDatepickerCancel>Cancelar</button>
                  <button matButton type="button" matDatepickerApply>Aplicar</button>
                </mat-datepicker-actions>
              </mat-datepicker>
              <mat-hint>dd-mm-aaaa · Sin fecha, hasta fin de mes</mat-hint>
            </mat-form-field>
          </div>
        }
        <p role="status" class="ms-10 text-sm text-destructive">{{ errores().socio }}</p>
      </section>

      <section data-tipo="profesor">
        <mat-checkbox name="profesor" [(ngModel)]="borrador.profesor">Profesor</mat-checkbox>
        @if (borrador.profesor) {
          <div class="ms-10 mt-2 grid gap-3 sm:grid-cols-2">
            <!-- D14: una ficha de antes, sin cuenta, se asocia a esta y conserva sus clases. -->
            @if (!cuenta().profesor && fichasSinCuenta().length > 0) {
              <mat-form-field class="sm:col-span-2">
                <mat-label>Ficha</mat-label>
                <mat-select name="fichaSinCuenta" [(ngModel)]="borrador.fichaSinCuenta">
                  <mat-option [value]="0">Una ficha nueva</mat-option>
                  @for (ficha of fichasSinCuenta(); track ficha.id) {
                    <mat-option [value]="ficha.id">
                      Es la ficha de {{ ficha.nombreVisible }} · {{ ficha.especialidad }}
                    </mat-option>
                  }
                </mat-select>
                <mat-hint>Si ya daba clases sin cuenta, elige su ficha: conserva sus clases</mat-hint>
              </mat-form-field>
            }
            @if (!borrador.fichaSinCuenta) {
              <mat-form-field>
                <mat-label>Nombre que se anuncia</mat-label>
                <input matInput name="nombreVisible" [(ngModel)]="borrador.ficha.nombreVisible" />
              </mat-form-field>
              <mat-form-field>
                <mat-label>Teléfono</mat-label>
                <span matTextPrefix>+56&nbsp;</span>
                <input
                  matInput
                  appTelefono
                  #telefono="ngModel"
                  name="telefonoProfesor"
                  [(ngModel)]="borrador.ficha.telefono"
                />
                <mat-error>{{ errorDelCampo(telefono.control) }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Especialidad</mat-label>
                <input matInput name="especialidad" [(ngModel)]="borrador.ficha.especialidad" />
              </mat-form-field>
              <mat-form-field>
                <mat-label>Tarifa por hora</mat-label>
                <span matTextPrefix>$&nbsp;</span>
                <input
                  matInput
                  type="number"
                  min="0"
                  name="tarifaHoraClp"
                  [(ngModel)]="borrador.ficha.tarifaHoraClp"
                />
                <mat-hint>Opcional</mat-hint>
              </mat-form-field>
            }
          </div>
        }
        <p role="status" class="ms-10 text-sm text-destructive">{{ errores().profesor }}</p>
      </section>

      <section data-tipo="tipos">
        <div>
          <mat-checkbox name="gestor" [(ngModel)]="borrador.gestor">
            Gestor
            <span class="text-muted-foreground"> — ve la agenda del día y anota observaciones</span>
          </mat-checkbox>
        </div>
        <div>
          <!-- Nadie se quita a sí mismo el acceso al panel: el servidor lo rechaza igual. -->
          <mat-checkbox name="admin" [disabled]="esYoAdmin()" [(ngModel)]="borrador.admin">
            Administrador
            <span class="text-muted-foreground"> — ve todo el panel</span>
          </mat-checkbox>
        </div>
        <p role="status" class="ms-10 text-sm text-destructive">{{ errores().tipos }}</p>
      </section>

      <div>
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
  `,
})
export class TiposDeLaCuenta {
  protected readonly errorDelCampo = errorDelCampo;

  private readonly usuarios = inject(Usuarios);
  private readonly socios = inject(Socios);
  private readonly profes = inject(Profesores);
  private readonly dialogos = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly yo = inject(Auth).usuario;

  readonly cuenta = input.required<FichaDeCuenta>();

  /** Algo se guardó: quien la muestra relee la cuenta. */
  readonly guardado = output<void>();

  protected readonly borrador = {
    socio: false,
    numeroSocio: '',
    /** Como la entrega el calendario de Material, y a texto al guardar (A5, T244). */
    alDiaHasta: null as Date | null,
    profesor: false,
    /** 0: una ficha nueva; si no, el id de una ficha de antes, sin cuenta (D14). */
    fichaSinCuenta: 0,
    ficha: { nombreVisible: '', telefono: '', especialidad: '', tarifaHoraClp: null as number | null },
    gestor: false,
    admin: false,
  };

  protected readonly guardando = signal(false);
  protected readonly errores = signal<Partial<Record<Paso, string>>>({});

  /** Las fichas de profesor sin cuenta, para asociar una (D14). */
  private readonly fichas = resource({ loader: () => this.profes.listar() });
  protected readonly fichasSinCuenta = computed(() =>
    this.fichas.hasValue() ? this.fichas.value().filter((ficha) => ficha.usuarioId === null) : [],
  );

  protected readonly esYoAdmin = computed(
    () => this.cuenta().id === this.yo()?.id && this.cuenta().esAdmin,
  );

  constructor() {
    // Con cada cuenta (o la misma, releída después de guardar), las casillas dicen lo que es.
    effect(() => {
      const cuenta = this.cuenta();
      const profesor = cuenta.profesor;

      Object.assign(this.borrador, {
        socio: !!cuenta.socio,
        numeroSocio: '',
        alDiaHasta: null,
        profesor: !!profesor?.activo,
        fichaSinCuenta: 0,
        ficha: profesor
          ? {
              nombreVisible: profesor.nombreVisible,
              telefono: profesor.telefono,
              especialidad: profesor.especialidad,
              tarifaHoraClp: profesor.tarifaHoraClp,
            }
          : {
              nombreVisible: `${cuenta.nombre} ${cuenta.apellido}`.trim(),
              telefono: cuenta.telefono ?? '',
              especialidad: '',
              tarifaHoraClp: null,
            },
        gestor: cuenta.esGestor,
        admin: cuenta.esAdmin,
      });
    });
  }

  protected async guardar(): Promise<void> {
    const cuenta = this.cuenta();
    const errores: Partial<Record<Paso, string>> = {};
    let algo = false;

    this.errores.set({});
    this.guardando.set(true);
    try {
      // 1. Gestor y admin, en una sola llamada.
      const tipos = {
        ...(this.borrador.gestor !== cuenta.esGestor && { esGestor: this.borrador.gestor }),
        ...(this.borrador.admin !== cuenta.esAdmin && { esAdmin: this.borrador.admin }),
      };
      if (Object.keys(tipos).length > 0) {
        await this.paso('tipos', errores, () => this.usuarios.cambiar(cuenta.id, tipos));
        algo = true;
      }

      // 2. Socio: solo se marca.
      if (this.borrador.socio && !cuenta.socio) {
        await this.paso('socio', errores, () =>
          this.socios.invitar({
            email: cuenta.email,
            ...(this.borrador.numeroSocio.trim() && {
              numeroSocio: this.borrador.numeroSocio.trim(),
            }),
            ...(this.borrador.alDiaHasta && { alDiaHasta: fechaATexto(this.borrador.alDiaHasta) }),
          }),
        );
        algo = true;
      }

      // 3. Profesor.
      algo = (await this.guardarProfesor(cuenta, errores)) || algo;
    } finally {
      this.guardando.set(false);
    }

    this.errores.set(errores);
    if (!algo) return;
    if (Object.keys(errores).length === 0) {
      this.snackBar.open(
        `Se guardaron los tipos de ${cuenta.nombre} ${cuenta.apellido}.`,
        undefined,
        LO_HECHO,
      );
    }
    this.guardado.emit();
  }

  /** El paso del profesor; dice si hubo algo que guardar. */
  private async guardarProfesor(
    cuenta: FichaDeCuenta,
    errores: Partial<Record<Paso, string>>,
  ): Promise<boolean> {
    const actual = cuenta.profesor;
    const ficha: FichaNueva = {
      ...this.borrador.ficha,
      tarifaHoraClp:
        this.borrador.ficha.tarifaHoraClp === null || `${this.borrador.ficha.tarifaHoraClp}` === ''
          ? null
          : Number(this.borrador.ficha.tarifaHoraClp),
    };

    if (!this.borrador.profesor) {
      if (!actual?.activo) return false;
      // Quitarlo desactiva la ficha: sus clases por venir siguen a su nombre.
      if (actual.clasesPorVenir > 0) {
        const si = await confirmar(this.dialogos, {
          titulo: `¿Quitarle el Profesor a ${cuenta.nombre} ${cuenta.apellido}?`,
          detalle:
            `Tiene ${actual.clasesPorVenir} ${actual.clasesPorVenir === 1 ? 'clase' : 'clases'} ` +
            'por venir, que siguen a su nombre. Si no las va a dar, cancélalas en Clases.',
          confirmar: 'Sí, quitárselo',
        });
        if (!si) return false;
      }
      await this.paso('profesor', errores, () => this.profes.editar(actual.id, { activo: false }));
      return true;
    }

    if (actual) {
      const cambio = { ...cambiosDe(actual, ficha), ...(!actual.activo && { activo: true }) };
      if (Object.keys(cambio).length === 0) return false;
      await this.paso('profesor', errores, () => this.profes.editar(actual.id, cambio));
      return true;
    }

    const sinCuenta = this.fichasSinCuenta().find(
      (deAntes) => deAntes.id === Number(this.borrador.fichaSinCuenta),
    );
    await this.paso('profesor', errores, async () => {
      if (!sinCuenta) return this.profes.crear(ficha, cuenta.id);

      await this.profes.vincular(sinCuenta.id, cuenta.id);
      // Una ficha de antes que estaba desactivada vuelve a dar clases: si no, quedaría con
      // la cuenta y la casilla Profesor, recién marcada, aparecería sin marcar.
      if (!sinCuenta.activo) await this.profes.editar(sinCuenta.id, { activo: true });
      return undefined;
    });
    return true;
  }

  /** Un paso de «Guardar»: si falla, su error queda junto a su casilla y los demás siguen. */
  private async paso(
    cual: Paso,
    errores: Partial<Record<Paso, string>>,
    accion: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await accion();
    } catch (falla) {
      errores[cual] = mensajeDelServidor(falla, 'No se pudo guardar.');
    }
  }
}

/** Lo que cambió de la ficha del profesor, campo por campo. */
function cambiosDe(
  actual: NonNullable<FichaDeCuenta['profesor']>,
  ficha: FichaNueva,
): Partial<FichaNueva> {
  return Object.fromEntries(
    (Object.keys(ficha) as (keyof FichaNueva)[])
      .filter((campo) => ficha[campo] !== actual[campo])
      .map((campo) => [campo, ficha[campo]]),
  );
}
