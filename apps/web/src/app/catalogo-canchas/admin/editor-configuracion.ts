import {
  Component,
  computed,
  inject,
  linkedSignal,
  output,
  resource,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import {
  AdminCanchas,
  ConfiguracionDelClub,
  ReglasDelClub,
} from './admin-canchas.service';

/** Cada regla con su etiqueta y su ayuda. El orden es el de la pantalla. */
const REGLAS: {
  campo: keyof ReglasDelClub;
  etiqueta: string;
  ayuda: string;
}[] = [
  {
    campo: 'duracionBloqueMin',
    etiqueta: 'Duración del bloque (minutos)',
    ayuda: 'De cuánto es cada hora de cancha en la grilla.',
  },
  {
    campo: 'cupoDiarioSocioHoras',
    etiqueta: 'Cupo diario del socio (horas)',
    ayuda: 'Cuántas horas puede reservar un socio en un mismo día.',
  },
  {
    campo: 'cupoPicoSemanalHoras',
    etiqueta: 'Cupo semanal en horario pico (horas)',
    ayuda: 'Se cuenta de lunes a domingo, solo sobre las franjas marcadas pico.',
  },
  {
    campo: 'invitadosPorMes',
    etiqueta: 'Invitados por mes',
    ayuda: 'Jugar con otro socio del club no descuenta de este cupo.',
  },
  {
    campo: 'horasMinModificacion',
    etiqueta: 'Horas mínimas para modificar',
    ayuda: 'Con menos que esto, la reserva ya no se puede reagendar.',
  },
  {
    campo: 'horasReembolsoTotal',
    etiqueta: 'Horas para el reembolso total',
    ayuda: 'Cancelando con esta antelación, se devuelve el 100%.',
  },
  {
    campo: 'diasSancionNoUso',
    etiqueta: 'Días de sanción por hora no usada',
    ayuda: 'Cuánto queda sin reservar quien tomó una hora y no la usó.',
  },
];

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
  imports: [FormsModule],
  template: `
    <section class="mt-8" aria-labelledby="titulo-reglas">
      <h2 id="titulo-reglas" class="rotulo-seccion">
        Reglas del club
      </h2>
      <p class="mt-2 text-sm text-muted-foreground">
        Valen para todas las canchas. Cada una rige desde que se guarda.
      </p>

      @if (reglas.isLoading()) {
        <p class="mt-3 text-muted-foreground">Cargando…</p>
      } @else if (valores(); as puestos) {
        <form class="mt-3" (ngSubmit)="guardar()">
          <div class="grid gap-4 sm:grid-cols-2">
            @for (regla of definiciones; track regla.campo) {
              <div>
                <label [for]="regla.campo" class="block text-sm font-medium">
                  {{ regla.etiqueta }}
                </label>
                <input
                  [id]="regla.campo"
                  [name]="regla.campo"
                  type="number"
                  min="0"
                  class="campo mt-1 w-28"
                  [attr.aria-describedby]="regla.campo + '-ayuda'"
                  [ngModel]="puestos[regla.campo]"
                  (ngModelChange)="cambiar(regla.campo, $event)"
                />
                <p
                  [id]="regla.campo + '-ayuda'"
                  class="mt-1 text-xs text-muted-foreground"
                >
                  {{ regla.ayuda }}
                </p>
              </div>
            }
          </div>

          @if (cambiaLaDuracion()) {
            <!-- Antes de guardar y no después: lo que asusta de este cambio es si
                 se caen las reservas hechas, y esa pregunta se responde acá. -->
            <p class="mt-4 rounded-lg border border-accent-strong bg-muted p-3 text-sm">
              Cambiar la duración del bloque redibuja la grilla de todas las
              canchas. Los bloques se calculan, así que no toca ninguna reserva
              ya hecha: las que existen mantienen su hora.
            </p>
          }

          <button
            type="submit"
            [disabled]="guardando()"
            class="boton boton-primario mt-4"
          >
            Guardar reglas
          </button>

          <p role="status" aria-live="polite" class="mt-2 text-sm">
            @if (error()) {
              <span class="text-destructive">{{ error() }}</span>
            } @else if (aviso()) {
              <span class="text-accent-strong">{{ aviso() }}</span>
            }
          </p>
        </form>
      }
    </section>
  `,
})
export class EditorConfiguracion {
  private readonly api = inject(AdminCanchas);

  /** Lo que depende de las reglas y hay que releer: las advertencias de tarifa. */
  readonly guardado = output<void>();

  protected readonly definiciones = REGLAS;

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly reglas = resource({
    loader: () => this.api.configuracion(),
  });

  /**
   * Lo que hay escrito en el formulario.
   *
   * `linkedSignal` y no una copia en `ngOnInit`: cuando la carga responde —o cuando
   * se relee tras guardar—, el formulario se vuelve a sembrar solo con lo que dice
   * el servidor, que es la única fuente de verdad de estas seis reglas.
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

  /** Para el aviso: solo importa si la duración quedó distinta de la guardada. */
  protected readonly cambiaLaDuracion = computed(() => {
    const guardadas = this.reglas.value();
    const enPantalla = this.valores();

    return (
      guardadas != null &&
      enPantalla != null &&
      enPantalla.duracionBloqueMin !== guardadas.duracionBloqueMin
    );
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
      this.aviso.set(null);
      this.error.set('Completa todas las reglas: ninguna puede quedar vacía.');
      return;
    }

    this.error.set(null);
    this.aviso.set(null);
    this.guardando.set(true);

    try {
      await this.api.fijarConfiguracion(completas);
      this.aviso.set('Reglas guardadas. Rigen desde ahora.');
      // Se relee del servidor en vez de creerle al formulario: así el aviso de la
      // duración se apaga contra lo que quedó guardado de verdad.
      this.reglas.reload();
      this.guardado.emit();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    } finally {
      this.guardando.set(false);
    }
  }
}
