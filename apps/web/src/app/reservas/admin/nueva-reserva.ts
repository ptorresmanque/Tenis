import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  resource,
  signal,
  TemplateRef,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButton } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';

import { dialogoSegun } from '../../ui/dialogo';
import { errorDelCampo, proveerCampos } from '../../ui/campos';
import { BloqueDisponible, Cancha } from '../../catalogo-canchas/disponibilidad';
import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
  minutosDe,
} from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { SocioDelClub, Socios } from '../../identidad/admin/socios.service';
import { Aviso } from '../../ui/aviso';
import { ReservasDelAdmin } from './nueva-reserva.service';
import { TelefonoDirective } from '../../ui/telefono';
import { CampoDeAcompanantes, clave } from '../campo-de-acompanantes';
import { AcompananteNuevo } from '../reservas.service';

/**
 * La hora que el club toma por teléfono o con alguien en el mostrador. La cancha y la hora se
 * eligen en el tablero, como en el sitio (T390); acá se dice para quién es.
 *
 * **Muestra el cupo del socio antes de crear** (decisión § 5.2 del plan): la reserva
 * del mesón consume su hora del día igual que si la tomara él, y decir "hoy ya
 * jugaste" mientras la persona está al teléfono es una conversación; decirlo después
 * de apretar, una llamada de vuelta.
 *
 * Es un MatDialog (T252): el foco queda atrapado, `Esc` cierra y el foco vuelve a «Reservar»
 * de la barra, sin código nuestro.
 */
@Component({
  selector: 'app-nueva-reserva',
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    CampoDeAcompanantes,
    Aviso,
    MatButtonToggleModule,
    TelefonoDirective,
    MatChipsModule,
    MatIcon,
  ],
  providers: [proveerCampos()],
  template: `
    <ng-template #dialogo>
      <h2 mat-dialog-title>Nueva reserva</h2>
      <mat-dialog-content>
        <!-- La cancha y la hora vienen del tablero, como en el diálogo del sitio (T390). -->
        <p class="text-muted-foreground">
          <!-- El día también: el panel abre días que no son hoy, y por teléfono se confirma. -->
          {{ elDia() }} · {{ cancha().nombre }} ·
          {{ hora(bloque().inicio) }}–{{ hora(bloque().fin) }}
        </p>
        <p class="mt-1 text-sm text-muted-foreground">
          La hora queda confirmada al instante: el cobro del visitante se hace en el mesón.
        </p>

        <form class="mt-4 grid gap-4" (ngSubmit)="crear()">
          <mat-button-toggle-group
            aria-label="Para quién es la hora"
            hideSingleSelectionIndicator
            [value]="paraQuien()"
            (change)="paraQuien.set($event.value)"
          >
            @for (opcion of PARA_QUIEN; track opcion.valor) {
              <mat-button-toggle [value]="opcion.valor">
                {{ opcion.etiqueta }}
              </mat-button-toggle>
            }
          </mat-button-toggle-group>

          @if (paraQuien() === 'socio') {
            <!-- Con autocompletado y no un select: el padrón tiene cientos de socios, y el
                 lineamiento pide buscar pasadas las quince opciones (T388). Solo los activos:
                 la API no le toma la hora a un suspendido ni a un retirado. -->
            <mat-form-field>
              <mat-label>Socio</mat-label>
              <input
                matInput
                id="titular"
                name="titular"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                [formControl]="titular"
                [matAutocomplete]="titulares"
              />
              <mat-autocomplete #titulares requireSelection [displayWith]="nombreDelTitular">
                @for (socio of titularesFiltrados(); track socio.id) {
                  <mat-option [value]="socio.id">{{ comoTitular(socio) }}</mat-option>
                } @empty {
                  <mat-option disabled>
                    {{ socios.isLoading() ? 'Cargando los socios…' : 'Sin resultados' }}
                  </mat-option>
                }
              </mat-autocomplete>
              <!-- Mientras llegan, la pista lo dice: se ve sin abrir la lista (T153). -->
              <mat-hint>{{
                socios.isLoading() ? 'Cargando los socios…' : 'Por su nombre o su número de socio.'
              }}</mat-hint>
              <mat-error>Elige un socio de la lista.</mat-error>
            </mat-form-field>
            @if (socios.error()) {
              <p class="text-sm text-destructive">
                No se pudo cargar la lista de socios. Reintenta en un momento.
              </p>
            }

            @if (sinPrimeParaElSocio(); as aviso) {
              <!-- La duración que el club no le permite al socio en prime (T213): antes no se
                   ofrecía en la lista de horas; ahora el tablero la deja elegir, porque al
                   visitante sí se le toma, y se dice acá antes de mandarla. -->
              <app-aviso variante="aviso">{{ aviso }}</app-aviso>
            }

            @if (cupo.error()) {
              <p class="text-sm text-destructive">
                No se pudo cargar el cupo del socio. Reintenta en un momento.
              </p>
            } @else if (cupo.value(); as datos) {
              <div class="rounded-xl border border-border bg-muted p-4">
                <p class="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  Cupo de {{ datos.nombre }}
                  @if (datos.alDia) {
                    <mat-chip-set class="insignias">
                      <mat-chip class="insignia exito">
                        <mat-icon matChipAvatar aria-hidden="true">check_circle</mat-icon>
                        Al día
                      </mat-chip>
                    </mat-chip-set>
                  } @else if (datos.graciaHasta) {
                    <!-- T382: con la cuota vencida pero en gracia, el socio todavía reserva, y el
                         mesón no tiene que decirle que no (SPEC-cuotas.md § Días de gracia). La
                         insignia lleva dos palabras, como las otras, y la fecha va al lado: un chip
                         es para una o dos palabras (lineamientos de Angular Material, chips). -->
                    <mat-chip-set class="insignias">
                      <mat-chip class="insignia aviso">
                        <mat-icon matChipAvatar aria-hidden="true">schedule</mat-icon>
                        En gracia
                      </mat-chip>
                    </mat-chip-set>
                    <span class="font-normal">hasta el {{ diaEnPalabras(datos.graciaHasta) }}</span>
                  } @else {
                    <mat-chip-set class="insignias">
                      <mat-chip class="insignia error">
                        <mat-icon matChipAvatar aria-hidden="true">cancel</mat-icon>
                        Cuota vencida
                      </mat-chip>
                    </mat-chip-set>
                  }
                </p>
                <ul class="mt-2 grid gap-1 text-sm text-muted-foreground">
                  <li>
                    Reservas de ese día: {{ datos.reservasDelDia }} de
                    {{ datos.cupoDiarioSocioReservas }}
                  </li>
                  <li>
                    Reservas prime de la semana: {{ datos.reservasPicoDeLaSemana }} de
                    {{ datos.cupoPicoSemanalReservas }}
                  </li>
                  <li>
                    Reservas con invitados del mes: {{ datos.reservasConInvitadosDelMes }} de
                    {{ datos.invitadosPorMes }}
                  </li>
                </ul>
              </div>
            }

            <!-- El socio no juega solo: la regla es la misma que en la web, y el mesón no es
                 una puerta para saltársela. El campo es el del sitio (T388): sugiere a los otros
                 socios, y el que se elige no le gasta al titular una reserva con invitados. -->
            <fieldset class="grid gap-2">
              <legend class="font-display text-sm font-bold tracking-wide uppercase">
                ¿Con quién juega?
              </legend>
              <p class="text-sm text-muted-foreground">
                Jugar solo con socios no gasta cupo. Con invitados, la reserva gasta una de sus
                reservas con invitados del mes, traiga uno o tres.
              </p>
              <app-campo-de-acompanantes
                [socios]="sugeribles()"
                nombreDeLaLista="Quienes juegan con el socio"
                [(acompanantes)]="acompanantes"
                (completo)="enfocarCrear()"
              />
            </fieldset>
          } @else {
            <mat-form-field>
              <mat-label>A nombre de <span aria-hidden="true">*</span></mat-label>
              <input matInput name="nombre" [(ngModel)]="nombre" />
            </mat-form-field>

            <div class="grid gap-4 sm:grid-cols-2">
              <mat-form-field>
                <mat-label>Teléfono</mat-label>
                <span matTextPrefix>+56&nbsp;</span>
                <!-- La referencia no se llama «telefono»: tapaba a la propiedad del mismo nombre,
                     el campo recibía el NgModel y el teléfono no viajaba (T390). -->
                <input
                  matInput
                  appTelefono
                  #campoTelefono="ngModel"
                  name="telefono"
                  [(ngModel)]="telefono"
                />
                <mat-error>{{ errorDelCampo(campoTelefono.control) }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Correo</mat-label>
                <input
                  matInput
                  name="email"
                  type="email"
                  [(ngModel)]="email"
                />
              </mat-form-field>
            </div>
          }

          @if (error(); as falla) {
            <app-aviso variante="error">{{ falla }}</app-aviso>
          }

          <div class="flex justify-end gap-2">
            <button matButton type="button" mat-dialog-close>Cancelar</button>
            <button
              #crearReserva
              matButton="filled"
              type="submit"
              [disabled]="enviando()"
              [attr.aria-busy]="enviando()"
            >
              {{ enviando() ? 'Creando…' : 'Crear reserva' }}
            </button>
          </div>
        </form>
      </mat-dialog-content>
    </ng-template>
  `,
})
export class NuevaReserva {
  protected readonly diaEnPalabras = diaEnPalabras;

  protected readonly errorDelCampo = errorDelCampo;

  /** La cancha que se eligió en el tablero (T390), como en el diálogo del sitio. */
  readonly cancha = input.required<Cancha>();
  /** La hora elegida: su inicio, su fin y lo que el club permite en ella. */
  readonly bloque = input.required<BloqueDisponible>();
  readonly cerrar = output<void>();
  readonly creada = output<string>();

  private readonly api = inject(ReservasDelAdmin);
  private readonly sociosApi = inject(Socios);

  private readonly dialogo = viewChild.required<TemplateRef<unknown>>('dialogo');
  /** Abierto mientras exista; crear la reserva lo apaga, y el diálogo se cierra solo. */
  private readonly abierto = signal(true);

  protected readonly PARA_QUIEN = [
    { valor: 'socio', etiqueta: 'Un socio' },
    { valor: 'visitante', etiqueta: 'Un visitante' },
  ];

  protected readonly paraQuien = signal('socio');
  /** El titular: mientras se escribe es texto; elegido de la lista, su id (T388). */
  protected readonly titular = new FormControl<number | string | null>(null, Validators.required);
  private readonly valorDelTitular = toSignal(this.titular.valueChanges, { initialValue: null });
  protected readonly socioId = computed(() => {
    const valor = this.valorDelTitular();
    return typeof valor === 'number' ? valor : 0;
  });
  protected readonly acompanantes = signal<AcompananteNuevo[]>([]);
  protected nombre = '';
  protected email = '';
  protected telefono = '';

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly socios = resource({ loader: () => this.sociosApi.listado() });

  /** Los socios a los que se les toma una hora: la API rechaza a los suspendidos y retirados. */
  private readonly activos = computed(() =>
    this.socios.hasValue()
      ? this.socios.value().socios.filter(({ estado }) => estado === 'ACTIVO')
      : [],
  );

  /** Los que calzan con lo escrito en el titular, por su nombre o su número. */
  protected readonly titularesFiltrados = computed(() => {
    const valor = this.valorDelTitular();
    const escrito = typeof valor === 'string' ? clave(valor) : '';

    return this.activos().filter((socio) => clave(this.comoTitular(socio)).includes(escrito));
  });

  /** Con quién puede jugar el titular: los otros activos, no él mismo. */
  protected readonly sugeribles = computed(() =>
    this.activos()
      .filter(({ id }) => id !== this.socioId())
      .map((socio) => ({
        numeroSocio: socio.numeroSocio,
        nombre: `${socio.usuario.nombre} ${socio.usuario.apellido}`.trim(),
      })),
  );

  protected comoTitular(socio: SocioDelClub): string {
    return `${socio.numeroSocio} · ${socio.usuario.nombre} ${socio.usuario.apellido}`.trim();
  }

  /** Lo que el campo muestra una vez elegido: el autocompletar guarda el id. */
  protected readonly nombreDelTitular = (id: number | null): string => {
    const socio = this.activos().find((uno) => uno.id === id);
    return socio ? this.comoTitular(socio) : '';
  };

  private readonly campoDeAcompanantes = viewChild(CampoDeAcompanantes);
  private readonly crearReserva = viewChild('crearReserva', { read: ElementRef<HTMLButtonElement> });
  private readonly injector = inject(Injector);

  /** Con los tres declarados, el foco va a «Crear reserva»: no queda nada más que escribir. */
  protected enfocarCrear(): void {
    afterNextRender(() => this.crearReserva()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** El cupo se pide al elegir socio: es lo que el club mira antes de decidir. */
  protected readonly cupo = resource({
    // El día de la hora elegida: el cupo diario y el prime de la semana se cuentan sobre él.
    params: () => ({ socioId: this.socioId(), fecha: fechaEnElClub(this.bloque().inicio) }),
    loader: ({ params }) =>
      params.socioId > 0
        ? this.api.cupoDe(params.socioId, params.fecha)
        : Promise.resolve(undefined),
  });

  /**
   * Por qué al socio no se le toma esta hora, o nulo (T213): en prime, el club le permite una sola
   * de las dos duraciones. El tablero del panel la deja elegir, porque al visitante sí se le toma.
   */
  protected readonly sinPrimeParaElSocio = computed(() =>
    this.paraQuien() === 'socio' && this.bloque().socioPuede === false
      ? `En horario prime, el socio solo puede reservar ${
          minutosDe(this.bloque()) === 90 ? '1 hora' : '1 hora y media'
        }: cambia la duración sobre el tablero y vuelve a elegir la hora.`
      : null,
  );

  constructor() {
    // Se abre al montarse: el componente solo existe mientras el diálogo está en pantalla.
    // Al cerrarse, por donde sea, avisa a la agenda para que lo quite.
    dialogoSegun(this.abierto, this.dialogo, () => this.cerrar.emit(), {
      width: '32rem',
      maxWidth: '92vw',
    });

    // El titular no juega consigo mismo: si se elige a quien ya estaba en «¿Con quién juega?», sale
    // de ahí (revisión, T394).
    effect(() => {
      const numero = this.activos().find(({ id }) => id === this.socioId())?.numeroSocio;
      if (!numero) return;
      untracked(() =>
        this.acompanantes.update((lista) => lista.filter((uno) => uno.numeroSocio !== numero)),
      );
    });
  }

  protected async crear(): Promise<void> {
    this.error.set(null);
    // «Agregar» es un paso que se salta fácil: lo escrito a la vista también cuenta.
    this.campoDeAcompanantes()?.agregarLoEscrito();

    // Sin titular no hay a quién tomarle la hora: el campo lo pide, sin ir a la API (revisión, T394).
    if (this.paraQuien() === 'socio' && this.socioId() === 0) {
      this.titular.markAsTouched();
      return;
    }

    // La API la rechazaría igual; dicho antes, el mesón le ofrece otra hora al socio.
    const sinPrime = this.sinPrimeParaElSocio();
    if (sinPrime) {
      this.error.set(sinPrime);
      return;
    }

    this.enviando.set(true);

    try {
      const { folio } = await this.api.crear({
        canchaId: this.cancha().id,
        inicio: this.bloque().inicio,
        // La duración la dice el bloque: el tablero lo pidió de 1 hora o de 1 hora y media.
        duracionMin: minutosDe(this.bloque()) === 90 ? 90 : 60,
        ...(this.paraQuien() === 'socio'
          ? {
              socioId: this.socioId(),
              acompanantes: this.acompanantes(),
            }
          : {
              nombre: this.nombre.trim(),
              email: this.email.trim(),
              telefono: this.telefono.trim(),
            }),
      });

      this.creada.emit(folio);
      this.abierto.set(false);
    } catch (falla) {
      // El mensaje del servidor tal cual: ya viene escrito para una persona, con el
      // cupo que se pasó y hasta cuándo.
      this.error.set(mensajeDelServidor(falla, 'No se pudo crear la reserva.'));
    } finally {
      this.enviando.set(false);
    }
  }

  protected readonly hora = horaEnElClub;
  protected readonly elDia = computed(() => diaEnPalabras(fechaEnElClub(this.bloque().inicio)));
}
