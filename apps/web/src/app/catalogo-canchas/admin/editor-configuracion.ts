import {
  Component,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { proveerCampos } from '../../ui/campos';
import { mensajeDelServidor } from '../../core/errores';
import {
  AdminCanchas,
  ConfiguracionDelClub,
  ReglasDelClub,
} from './admin-canchas.service';
import { Esqueleto } from '../../ui/esqueleto';
import { EditorPrime } from './editor-prime';
import { EditorTopeDeLuz } from './editor-tope-de-luz';
import { LO_HECHO } from '../../ui/material';

interface Regla {
  campo: keyof ReglasDelClub;
  etiqueta: string;
  ayuda: string;
  /** El mínimo del campo: las cuotas parten en 1 peso, las reglas en 0. */
  minimo: number;
}

/** Cada regla con su etiqueta y su ayuda. El orden es el de la pantalla. */
const DE_RESERVA: Regla[] = [
  {
    campo: 'cupoDiarioSocioReservas',
    etiqueta: 'Cupo diario del socio (reservas)',
    ayuda: 'Cuántas reservas puede tener un socio en un mismo día, de 1 hora o de 1 hora y media.',
    minimo: 0,
  },
  {
    campo: 'cupoPicoSemanalReservas',
    etiqueta: 'Cupo semanal en horario prime (reservas)',
    ayuda: 'Se cuenta de lunes a domingo, solo sobre las franjas marcadas prime.',
    minimo: 0,
  },
  {
    campo: 'invitadosPorMes',
    etiqueta: 'Reservas con invitados por mes',
    ayuda:
      'Una reserva con uno, dos o tres invitados cuenta como una. Jugar solo con socios ' +
      'del club no la gasta.',
    minimo: 0,
  },
  {
    campo: 'horasMinModificacion',
    etiqueta: 'Horas mínimas para modificar',
    ayuda: 'Con menos que esto, la reserva ya no se puede reagendar.',
    minimo: 0,
  },
  {
    campo: 'horasReembolsoTotal',
    etiqueta: 'Horas para el reembolso total',
    ayuda: 'Cancelando con esta antelación, se devuelve el 100%.',
    minimo: 0,
  },
  {
    campo: 'diasSancionNoUso',
    etiqueta: 'Días de sanción por hora no usada',
    ayuda: 'Cuánto queda sin reservar quien tomó una hora y no la usó.',
    minimo: 0,
  },
];

/**
 * Lo que vale ser socio. Existe en la base desde T40 y la emisión lo lee, pero hasta
 * acá solo lo escribía el seed: el panel no tenía dónde cambiarlo.
 */
const DE_CUOTA: Regla[] = [
  {
    campo: 'cuotaMensualClp',
    etiqueta: 'Mensualidad ($)',
    ayuda: 'Lo que paga cada socio por mes.',
    minimo: 1,
  },
  {
    campo: 'cuotaIncorporacionClp',
    etiqueta: 'Incorporación ($)',
    ayuda: 'Se cobra una sola vez, a quien entra al club.',
    minimo: 1,
  },
];

const GRUPOS = [
  {
    titulo: 'Reservas',
    nota: 'Valen para todas las canchas. Cada una rige desde que se guarda.',
    reglas: DE_RESERVA,
  },
  {
    titulo: 'Cuotas del socio',
    nota: 'Rigen desde la próxima cuota que se emita: las ya emitidas mantienen su monto.',
    reglas: DE_CUOTA,
  },
];

const REGLAS = [...DE_RESERVA, ...DE_CUOTA];

/** Lo que hay en los campos: números, o vacío mientras alguien está escribiendo. */
type ValoresEnPantalla = Record<keyof ReglasDelClub, number | ''>;

/** Descarta los datos de contacto que vienen en la misma respuesta. */
function soloLasReglas(config: ConfiguracionDelClub): ValoresEnPantalla {
  return Object.fromEntries(
    REGLAS.map(({ campo }) => [campo, config[campo]]),
  ) as ValoresEnPantalla;
}

/** Las reglas completas, o nada si algún campo quedó vacío. */
function todasNumericas(valores: ValoresEnPantalla): ReglasDelClub | null {
  return Object.values(valores).every((valor) => typeof valor === 'number')
    ? (valores as ReglasDelClub)
    : null;
}

/**
 * Las reglas del club, en un formulario.
 *
 * Existen en la base desde T4 y hasta T30 solo las escribía el seed, así que el
 * panel hablaba de "el general del club" sin dar dónde cambiarlo.
 */
@Component({
  selector: 'app-editor-configuracion',
  imports: [
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    Esqueleto,
    EditorPrime,
    EditorTopeDeLuz,
  ],
  providers: [proveerCampos()],
  template: `
    <section class="mt-8" aria-labelledby="titulo-reglas">
      <h2 id="titulo-reglas" class="rotulo-seccion">
        Reglas del club
      </h2>

      @if (reglas.isLoading()) {
        <app-esqueleto class="mt-3 block" [filas]="5" etiqueta="Cargando las reglas del club…" />
      } @else if (reglas.error()) {
        <p class="mt-3 text-destructive">
          No se pudieron cargar las reglas del club. Reintenta en un momento.
        </p>
      } @else if (valores(); as puestos) {
        <form class="mt-3" (ngSubmit)="guardar()">
          @for (grupo of grupos; track grupo.titulo) {
            <fieldset class="mt-4 first:mt-0">
              <legend class="text-base font-semibold">{{ grupo.titulo }}</legend>
              <p class="mt-1 text-sm text-muted-foreground">{{ grupo.nota }}</p>

              <div class="mt-3 grid gap-4 sm:grid-cols-2">
                @for (regla of grupo.reglas; track regla.campo) {
                  <mat-form-field>
                    <mat-label>{{ regla.etiqueta }}</mat-label>
                    <input
                      matInput
                      [id]="regla.campo"
                      [name]="regla.campo"
                      type="number"
                      [min]="regla.minimo"
                      [ngModel]="puestos[regla.campo]"
                      (ngModelChange)="cambiar(regla.campo, $event)"
                    />
                    <mat-hint>{{ regla.ayuda }}</mat-hint>
                  </mat-form-field>
                }
              </div>
            </fieldset>
          }

          <button
            matButton="filled"
            type="submit"
            [disabled]="guardando()"
            [attr.aria-busy]="guardando()"
            class="mt-4"
          >
            Guardar cambios
          </button>

          <p role="status" aria-live="polite" class="mt-2 text-sm">
            @if (error()) {
              <span class="text-destructive">{{ error() }}</span>
            }
          </p>
        </form>
      }
    </section>

    <app-editor-prime />

    <app-editor-tope-de-luz />
  `,
})
export class EditorConfiguracion {
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(AdminCanchas);

  protected readonly grupos = GRUPOS;

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly reglas = resource({
    loader: () => this.api.configuracion(),
  });

  /**
   * Lo que hay escrito en el formulario.
   *
   * `linkedSignal` y no una copia en `ngOnInit`: cuando la carga responde —o cuando
   * se relee tras guardar—, el formulario se vuelve a sembrar solo con lo que dice
   * el servidor, que es la única fuente de verdad de estas reglas y cuotas.
   *
   * El tipo admite `''` porque el campo numérico devuelve texto vacío al borrarlo.
   * Vale la incomodidad: fingir que siempre hay un número obliga a un cast, y ese
   * cast deja salir el string hacia la API como si fuera una regla del club.
   */
  protected readonly valores = linkedSignal<
    ConfiguracionDelClub | undefined,
    ValoresEnPantalla | null
  >({
    source: () => this.reglas.value(),
    // Solo las reglas numéricas: la misma fila trae los datos de contacto del
    // club, que edita otra pantalla y que este formulario no debe pisar.
    computation: (cargadas) => (cargadas ? soloLasReglas(cargadas) : null),
  });

  protected cambiar(campo: keyof ReglasDelClub, valor: unknown): void {
    const actuales = this.valores();
    if (!actuales) return;

    // El campo vacío se guarda como vacío y no como 0. **El `null` es el caso que
    // importa**: es lo que emite un `input type="number"` al borrarlo, y
    // `Number(null)` es cero —no `NaN`—, así que un chequeo por `NaN` lo dejaría
    // pasar y el club quedaría con "cero horas por socio" sin que nadie lo tipeara.
    const vacio = valor === '' || valor === null || valor === undefined;
    const numero = Number(valor);

    this.valores.set({
      ...actuales,
      [campo]: vacio || Number.isNaN(numero) ? '' : numero,
    });
  }

  protected async guardar(): Promise<void> {
    const valores = this.valores();
    if (!valores) return;

    const completas = todasNumericas(valores);
    if (!completas) {
      // Se ataja acá y no en el viaje de ida: el servidor respondería 400, pero
      // "tiene que ser un número entero" a la vuelta explica menos que decirlo
      // ahora, con el campo vacío a la vista.
      this.error.set('Completa todas las reglas: ninguna puede quedar vacía.');
      return;
    }

    this.error.set(null);
    this.guardando.set(true);

    try {
      await this.api.fijarConfiguracion(completas);
      this.snackBar.open(
        'Guardado. Las reglas rigen desde ahora; las cuotas, desde la próxima.',
        undefined,
        LO_HECHO,
      );
      // Se relee del servidor en vez de creerle al formulario: lo que queda en pantalla
      // es lo que quedó guardado de verdad.
      this.reglas.reload();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    } finally {
      this.guardando.set(false);
    }
  }
}
