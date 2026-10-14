import {
  Component,
  computed,
  inject,
  input,
  output,
  resource,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';

import { dialogoSegun } from '../../ui/dialogo';
import { errorDelCampo, proveerCampos } from '../../ui/campos';
import { Disponibilidad, DuracionMin } from '../../catalogo-canchas/disponibilidad';
import { horaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Socios } from '../../identidad/admin/socios.service';
import { Aviso } from '../../ui/aviso';
import { ReservasDelAdmin } from './nueva-reserva.service';
import { TelefonoDirective } from '../../ui/telefono';

/**
 * La hora que el club toma por teléfono o con alguien en el mostrador.
 *
 * **Muestra el cupo del socio antes de crear** (decisión § 5.2 del plan): la reserva
 * del mesón consume su hora del día igual que si la tomara él, y decir "hoy ya
 * jugaste" mientras la persona está al teléfono es una conversación; decirlo después
 * de apretar, una llamada de vuelta.
 *
 * Es un MatDialog (T252): el foco queda atrapado, `Esc` cierra y el foco vuelve al botón
 * «Nueva reserva», sin código nuestro.
 */
@Component({
  selector: 'app-nueva-reserva',
  imports: [
    MatDialogModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
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
        <p class="text-sm text-muted-foreground">
          Para el {{ fecha() }}. La hora queda confirmada al instante: el cobro del
          visitante se hace en el mesón.
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

          <mat-form-field>
            <mat-label>Cancha</mat-label>
            <!-- value y selectionChange, no ngModel: sin elegir, la cancha es la primera del
                 día (canchaElegida), y eso no es un campo que el formulario guarde. -->
            <mat-select
              name="cancha"
              [value]="canchaElegida()"
              (selectionChange)="canchaId.set($event.value)"
            >
              @for (grilla of grillasDelDia(); track grilla.cancha.id) {
                <mat-option
                  [value]="grilla.cancha.id"
                >
                  {{ grilla.cancha.nombre }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (grillas.error()) {
            <p class="text-sm text-destructive">
              No se pudo cargar la disponibilidad. Reintenta en un momento.
            </p>
          }

          <!-- Antes de la hora, porque decide qué horas quedan libres. Se ofrece la hora y
               media aunque la franja no tenga su precio: el socio no paga, y el visitante
               paga en el mostrador (T85). -->
          <mat-button-toggle-group
            aria-label="Duración"
            hideSingleSelectionIndicator
            [value]="'' + duracion()"
            (change)="elegirDuracion($event.value)"
          >
            @for (opcion of DURACIONES; track opcion.valor) {
              <mat-button-toggle [value]="opcion.valor">
                {{ opcion.etiqueta }}
              </mat-button-toggle>
            }
          </mat-button-toggle-group>

          <mat-form-field>
            <mat-label>Hora</mat-label>
            <mat-select
              name="hora"
              [value]="inicio()"
              (selectionChange)="inicio.set($event.value)"
            >
              <!-- Mientras llegan, la primera opción lo dice: un esqueleto no cabe dentro de
                   un select (T153). -->
              <mat-option value="">
                {{ grillas.isLoading() ? 'Cargando las horas libres…' : 'Elige una hora libre' }}
              </mat-option>
              @for (bloque of libres(); track bloque.inicio) {
                <!-- La cancha vacía que ya no se puede encender (T207): se ve y se explica,
                     para que el mesón no la busque por otro lado. -->
                <mat-option
                  [value]="bloque.inicio"
                  [disabled]="bloque.topeDeLuz"
                >
                  {{ hora(bloque.inicio) }}–{{ hora(bloque.fin) }}
                  @if (bloque.topeDeLuz) {
                    · Tope de luz
                  } @else if (bloque.esPico) {
                    · hora prime
                  }
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          @if (paraQuien() === 'socio') {
            <mat-form-field>
              <mat-label>Socio</mat-label>
              <mat-select
                name="socio"
                [value]="socioId()"
                (selectionChange)="socioId.set($event.value)"
              >
                <mat-option [value]="0">
                  {{ socios.isLoading() ? 'Cargando los socios…' : 'Elige un socio' }}
                </mat-option>
                @if (socios.hasValue()) {
                  @for (socio of socios.value().socios; track socio.id) {
                    <mat-option [value]="socio.id">
                      {{ socio.numeroSocio }} · {{ socio.usuario.nombre }}
                      {{ socio.usuario.apellido }}
                    </mat-option>
                  }
                }
              </mat-select>
            </mat-form-field>

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

            <!-- El socio no juega solo: la regla es la misma que en la web, y el mesón
                 no es una puerta para saltársela. -->
            <mat-form-field>
              <mat-label>Con quién juega</mat-label>
              <input
                matInput
                name="acompanante"
                placeholder="Nombre del invitado"
                [(ngModel)]="acompanante"
              />
              <mat-hint>
                Con invitados, la reserva gasta una de sus reservas con invitados del mes.
              </mat-hint>
            </mat-form-field>
          } @else {
            <mat-form-field>
              <mat-label>A nombre de <span aria-hidden="true">*</span></mat-label>
              <input matInput name="nombre" [(ngModel)]="nombre" />
            </mat-form-field>

            <div class="grid gap-4 sm:grid-cols-2">
              <mat-form-field>
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
  protected readonly errorDelCampo = errorDelCampo;

  /** El día que la agenda está mirando: la reserva se toma sobre ese día. */
  readonly fecha = input.required<string>();
  readonly cerrar = output<void>();
  readonly creada = output<string>();

  private readonly api = inject(ReservasDelAdmin);
  private readonly disponibilidad = inject(Disponibilidad);
  private readonly sociosApi = inject(Socios);

  private readonly dialogo = viewChild.required<TemplateRef<unknown>>('dialogo');
  /** Abierto mientras exista; crear la reserva lo apaga, y el diálogo se cierra solo. */
  private readonly abierto = signal(true);

  protected readonly PARA_QUIEN = [
    { valor: 'socio', etiqueta: 'Un socio' },
    { valor: 'visitante', etiqueta: 'Un visitante' },
  ];

  protected readonly DURACIONES = [
    { valor: '60', etiqueta: '1 hora' },
    { valor: '90', etiqueta: '1 hora y media' },
  ];

  protected readonly paraQuien = signal('socio');
  protected readonly duracion = signal<DuracionMin>(60);
  protected readonly canchaId = signal(0);
  protected readonly inicio = signal('');
  protected readonly socioId = signal(0);
  protected acompanante = '';
  protected nombre = '';
  protected email = '';
  protected telefono = '';

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly grillas = resource({
    params: () => ({ fecha: this.fecha(), duracion: this.duracion() }),
    loader: ({ params }) => this.disponibilidad.delDia(params.fecha, params.duracion),
    defaultValue: [],
  });

  /** `value()` lanza si la grilla no cargó, y el formulario se pinta igual. */
  protected readonly grillasDelDia = computed(() =>
    this.grillas.hasValue() ? this.grillas.value() : [],
  );

  protected readonly socios = resource({ loader: () => this.sociosApi.listado() });

  /** El cupo se pide al elegir socio: es lo que el club mira antes de decidir. */
  protected readonly cupo = resource({
    params: () => ({ socioId: this.socioId(), fecha: this.fecha() }),
    loader: ({ params }) =>
      params.socioId > 0
        ? this.api.cupoDe(params.socioId, params.fecha)
        : Promise.resolve(undefined),
  });

  /**
   * La cancha sobre la que se está trabajando.
   *
   * Mientras nadie elija, la primera de la lista: un selector en blanco obliga a un
   * clic que no decide nada, y con una sola cancha no decide nada nunca. Es un
   * `computed` y no un `effect` que escriba la señal, que era la versión anterior y
   * dependía de en qué orden llegara la grilla.
   */
  protected readonly canchaElegida = computed(
    () => this.canchaId() || this.grillasDelDia()[0]?.cancha.id || 0,
  );

  /**
   * Las horas que quedan libres en la cancha elegida, y las que el tope de canchas con luz
   * deja vacías, que se muestran deshabilitadas (T207).
   *
   * La que está corriendo sí se ofrece: el mesón la puede vender a quien llega a
   * jugar ahora. La que ya terminó no, porque la API la rechaza
   * (`BLOQUE_EN_EL_PASADO`). Se corta por `fin` y no por `inicio` como la grilla
   * pública. Si el reloj del navegador anda mal, manda la API.
   */
  protected readonly libres = computed(() => {
    const grilla = this.grillasDelDia().find((una) => una.cancha.id === this.canchaElegida());

    return (grilla?.bloques ?? []).filter(
      (bloque) =>
        !bloque.bloqueado &&
        (!bloque.reservado || bloque.topeDeLuz) &&
        // Al socio, la duración que el club no le permite en prime no se le ofrece (T213).
        !(this.paraQuien() === 'socio' && bloque.socioPuede === false) &&
        new Date(bloque.fin).getTime() > Date.now(),
    );
  });

  constructor() {
    // Se abre al montarse: el componente solo existe mientras el diálogo está en pantalla.
    // Al cerrarse, por donde sea, avisa a la agenda para que lo quite.
    dialogoSegun(this.abierto, this.dialogo, () => this.cerrar.emit(), {
      width: '32rem',
      maxWidth: '92vw',
    });
  }

  protected elegirDuracion(valor: string): void {
    this.duracion.set(valor === '90' ? 90 : 60);
    // La hora elegida era de la otra lista: con 1 hora y media puede chocar con la
    // reserva siguiente, o pasarse del cierre.
    this.inicio.set('');
  }

  protected async crear(): Promise<void> {
    this.error.set(null);

    if (!this.inicio()) {
      this.error.set('Elige la hora de la reserva.');
      return;
    }

    this.enviando.set(true);

    try {
      const { folio } = await this.api.crear({
        canchaId: this.canchaElegida(),
        inicio: this.inicio(),
        duracionMin: this.duracion(),
        ...(this.paraQuien() === 'socio'
          ? {
              socioId: this.socioId(),
              acompanantes: this.acompanante.trim()
                ? [{ nombre: this.acompanante.trim() }]
                : [],
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
}
