import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Disponibilidad, DuracionMin } from '../../catalogo-canchas/disponibilidad';
import { horaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Socios } from '../../identidad/admin/socios.service';
import { Aviso } from '../../ui/aviso';
import { Campo, CampoControl } from '../../ui/campo';
import { Insignia } from '../../ui/insignia';
import { Selector } from '../../ui/selector';
import { ReservasDelAdmin } from './nueva-reserva.service';

/**
 * La hora que el club toma por teléfono o con alguien en el mostrador.
 *
 * **Muestra el cupo del socio antes de crear** (decisión § 5.2 del plan): la reserva
 * del mesón consume su hora del día igual que si la tomara él, y decir "hoy ya
 * jugaste" mientras la persona está al teléfono es una conversación; decirlo después
 * de apretar, una llamada de vuelta.
 *
 * Es un `<dialog>` abierto con `showModal()`: el foco queda atrapado y `Esc` cierra,
 * sin código nuestro.
 */
@Component({
  selector: 'app-nueva-reserva',
  imports: [FormsModule, Aviso, Campo, CampoControl, Insignia, Selector],
  template: `
    <dialog
      #dialogo
      closedby="any"
      class="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl backdrop:bg-foreground/50"
      (close)="cerrar.emit()"
    >
      <h2 class="titular text-2xl">Nueva reserva</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Para el {{ fecha() }}. La hora queda confirmada al instante: el cobro del
        visitante se hace en el mesón.
      </p>

      <form class="mt-4 grid gap-4" (ngSubmit)="crear()">
        <app-selector
          etiqueta="Para quién es la hora"
          [opciones]="PARA_QUIEN"
          [valor]="paraQuien()"
          (valorChange)="paraQuien.set($event)"
        />

        <app-campo etiqueta="Cancha">
          <!-- value y change nativos, no ngModel: el id de la cancha es un número
               y ngModel lo compara contra el texto del value, así que ninguna
               opción quedaba marcada. -->
          <select
            appCampoControl
            name="cancha"
            class="campo"
            (change)="canchaId.set(+$any($event.target).value)"
          >
            @for (grilla of grillasDelDia(); track grilla.cancha.id) {
              <option
                [value]="grilla.cancha.id"
                [selected]="grilla.cancha.id === canchaElegida()"
              >
                {{ grilla.cancha.nombre }}
              </option>
            }
          </select>
        </app-campo>
        @if (grillas.error()) {
          <p class="text-sm text-destructive">
            No se pudo cargar la disponibilidad. Reintenta en un momento.
          </p>
        }

        <!-- Antes de la hora, porque decide qué horas quedan libres. Se ofrece la hora y
             media aunque la franja no tenga su precio: el socio no paga, y el visitante
             paga en el mostrador (T85). -->
        <app-selector
          etiqueta="Duración"
          [opciones]="DURACIONES"
          [valor]="'' + duracion()"
          (valorChange)="elegirDuracion($event)"
        />

        <app-campo etiqueta="Hora">
          <select
            appCampoControl
            name="hora"
            class="campo"
            (change)="inicio.set($any($event.target).value)"
          >
            <option value="" [selected]="inicio() === ''">Elige una hora libre</option>
            @for (bloque of libres(); track bloque.inicio) {
              <option [value]="bloque.inicio" [selected]="bloque.inicio === inicio()">
                {{ hora(bloque.inicio) }}–{{ hora(bloque.fin) }}
                @if (bloque.esPico) {
                  · hora pico
                }
              </option>
            }
          </select>
        </app-campo>

        @if (paraQuien() === 'socio') {
          <app-campo etiqueta="Socio">
            <select
              appCampoControl
              name="socio"
              class="campo"
              (change)="socioId.set(+$any($event.target).value)"
            >
              <option [value]="0">Elige un socio</option>
              @if (socios.hasValue()) {
                @for (socio of socios.value().socios; track socio.id) {
                  <option [value]="socio.id">
                    {{ socio.numeroSocio }} · {{ socio.usuario.nombre }}
                    {{ socio.usuario.apellido }}
                  </option>
                }
              }
            </select>
          </app-campo>

          @if (cupo.error()) {
            <p class="text-sm text-destructive">
              No se pudo cargar el cupo del socio. Reintenta en un momento.
            </p>
          } @else if (cupo.value(); as datos) {
            <div class="rounded-xl border border-border bg-muted p-4">
              <p class="flex flex-wrap items-center gap-2 text-sm font-semibold">
                Cupo de {{ datos.nombre }}
                @if (datos.alDia) {
                  <app-insignia variante="exito">Al día</app-insignia>
                } @else {
                  <app-insignia variante="error">Cuota vencida</app-insignia>
                }
              </p>
              <ul class="mt-2 grid gap-1 text-sm text-muted-foreground">
                <li>
                  Reservas de ese día: {{ datos.reservasDelDia }} de
                  {{ datos.cupoDiarioSocioReservas }}
                </li>
                <li>
                  Reservas pico de la semana: {{ datos.reservasPicoDeLaSemana }} de
                  {{ datos.cupoPicoSemanalReservas }}
                </li>
                <li>
                  Invitados del mes: {{ datos.invitadosDelMes }} de
                  {{ datos.invitadosPorMes }}
                </li>
              </ul>
            </div>
          }

          <!-- El socio no juega solo: la regla es la misma que en la web, y el mesón
               no es una puerta para saltársela. -->
          <app-campo
            etiqueta="Con quién juega"
            ayuda="Un invitado descuenta de sus invitados del mes."
          >
            <input
              appCampoControl
              name="acompanante"
              class="campo"
              placeholder="Nombre del invitado"
              [(ngModel)]="acompanante"
            />
          </app-campo>
        } @else {
          <app-campo etiqueta="A nombre de" [obligatorio]="true">
            <input appCampoControl name="nombre" class="campo" [(ngModel)]="nombre" />
          </app-campo>

          <div class="grid gap-4 sm:grid-cols-2">
            <app-campo etiqueta="Teléfono">
              <input
                appCampoControl
                name="telefono"
                type="tel"
                class="campo"
                [(ngModel)]="telefono"
              />
            </app-campo>
            <app-campo etiqueta="Correo">
              <input
                appCampoControl
                name="email"
                type="email"
                class="campo"
                [(ngModel)]="email"
              />
            </app-campo>
          </div>
        }

        @if (error(); as falla) {
          <app-aviso variante="error">{{ falla }}</app-aviso>
        }

        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="boton boton-texto"
            (click)="dialogo.close()"
          >
            Cancelar
          </button>
          <button type="submit" class="boton boton-primario" [disabled]="enviando()">
            {{ enviando() ? 'Creando…' : 'Crear reserva' }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class NuevaReserva {
  /** El día que la agenda está mirando: la reserva se toma sobre ese día. */
  readonly fecha = input.required<string>();
  readonly cerrar = output<void>();
  readonly creada = output<string>();

  private readonly api = inject(ReservasDelAdmin);
  private readonly disponibilidad = inject(Disponibilidad);
  private readonly sociosApi = inject(Socios);

  private readonly dialogo =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

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
   * Las horas que quedan libres en la cancha elegida.
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
        !bloque.reservado &&
        new Date(bloque.fin).getTime() > Date.now(),
    );
  });

  constructor() {
    // Se abre al montarse: el componente solo existe mientras el diálogo está en
    // pantalla, así que no hay un estado "cerrado" que mantener.
    queueMicrotask(() => this.dialogo().nativeElement.showModal());
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
      this.dialogo().nativeElement.close();
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
