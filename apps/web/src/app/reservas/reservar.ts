import {
  afterNextRender,
  Component,
  effect,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  resource,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { errorDelCampo, proveerCampos } from '../ui/campos';
import { Auth } from '../core/auth/auth';
import { irAPagar } from '../core/pagos/ir-a-pagar';
import { BloqueDisponible, Cancha } from '../catalogo-canchas/disponibilidad';
import { enPesos, horaEnElClub, minutosDe } from '../catalogo-canchas/reloj-del-club';
import {
  AcompananteNuevo,
  mensajeDeRechazo,
  Reservas,
} from './reservas.service';
import { dialogoSegun } from '../ui/dialogo';
import { TelefonoDirective } from '../ui/telefono';
import { CampoDeAcompanantes } from './campo-de-acompanantes';

/**
 * El formulario de reserva, para socio y para visitante.
 *
 * Es uno solo y no dos porque la mitad de arriba —qué cancha, qué hora, qué cuesta—
 * es idéntica, y lo que cambia es qué hace falta declarar: el socio dice con quién
 * juega, el visitante dice cómo ubicarlo y paga.
 */
@Component({
  selector: 'app-reservar',
  imports: [
    CampoDeAcompanantes,
    MatDialogModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    ReactiveFormsModule,
    TelefonoDirective,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- Un MatDialog y no un div con overlay (T252): atrapa el foco, cierra con Escape,
         vuelve inerte el fondo y devuelve el foco a la celda al cerrarse. En el teléfono
         es una hoja pegada abajo. Ojo: sin acentos graves acá adentro, que cierran el
         template. -->
    <ng-template #dialogo>
      <h2 mat-dialog-title>{{ esSocio() ? 'Reservar tu hora' : 'Reservar y pagar' }}</h2>
      <mat-dialog-content>
        <section>
          <p class="text-muted-foreground">
            {{ cancha().nombre }} · {{ hora(bloque().inicio) }}–{{ hora(bloque().fin) }}
          </p>

          <!-- Sin precio no llega: la grilla no le ofrece al visitante una duración que esa
               franja no vende (T83b). -->
          @let arriendo = bloque().montoClp;
          @if (!esSocio() && arriendo !== null) {
            <!-- En azul y no en verde: el verde quedó para "libre" (decisión 6). -->
            <p class="mt-2 font-display text-3xl font-bold text-primary">
              {{ pesos(arriendo) }}
            </p>
          }

          <form class="mt-4 space-y-4" [formGroup]="formulario" (ngSubmit)="enviar()">
            @if (!esSocio()) {
              <mat-form-field>
                <mat-label>Nombre</mat-label>
                <input
                  matInput
                  id="nombre"
                  formControlName="nombre"
                  autocomplete="name"
                />
                <mat-error>{{ errorDelCampo(formulario.controls.nombre) }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Correo</mat-label>
                <input
                  matInput
                  id="email"
                  type="email"
                  formControlName="email"
                  autocomplete="email"
                />
                <mat-error>{{ errorDelCampo(formulario.controls.email) }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Teléfono</mat-label>
                <span matTextPrefix>+56&nbsp;</span>
                <input
                  matInput
                  appTelefono
                  id="telefono"
                  formControlName="telefono"
                />
                <mat-error>{{ errorDelCampo(formulario.controls.telefono) }}</mat-error>
              </mat-form-field>
            }

            <!-- Con quién juega, de 1 a 3 (T107). Un solo campo: al socio le sugiere los
                 socios del club y sus invitados anteriores; lo que no está en ninguna lista
                 queda como invitado nuevo. Al visitante, sin sugerencias: serían el padrón. -->
            <fieldset class="space-y-3">
              <legend class="font-display text-sm font-bold tracking-wide uppercase">
                ¿Con quién vas a jugar?
              </legend>
              <p class="text-sm text-muted-foreground">
                @if (esSocio()) {
                  Jugar solo con socios no gasta cupo. Con invitados, la reserva gasta
                  una de tus reservas con invitados del mes, traiga uno o tres.
                } @else {
                  Escribe el nombre de cada persona, de una a tres.
                }
              </p>

              <!-- El campo es el mismo del mesón (T388): ver CampoDeAcompanantes. -->
              <app-campo-de-acompanantes
                [socios]="sociosSeguros()"
                [invitados]="invitadosSeguros()"
                [conSugerencias]="esSocio()"
                [(acompanantes)]="acompanantes"
                (acompanantesChange)="error.set(null)"
                (completo)="enfocarConfirmar()"
              />

              <!-- La lista que no cargó no es una lista vacía, y sin ella un socio escrito a
                   mano quedaría como invitado y gastaría cupo: se dice, con la salida. -->
              @if (esSocio() && socios.error()) {
                <p role="alert" class="bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  No pudimos cargar la lista de socios: uno escrito a mano quedaría como
                  invitado.
                  <button
                    type="button"
                    class="cursor-pointer font-semibold underline"
                    (click)="socios.reload()"
                  >
                    Reintentar
                  </button>
                </p>
              }
            </fieldset>

            @if (error()) {
              <!-- El mensaje del servidor tal cual: ya viene escrito para la persona,
                   con el límite y cuándo se renueva. -->
              <p role="alert" class="bg-destructive/10 p-3 text-destructive">
                {{ error() }}
              </p>
            }

            <div class="flex justify-end gap-2 pt-2">
              <button matButton type="button" mat-dialog-close>Cancelar</button>
              <!-- Primario y no verde (decisión 6 del plan): el verde quedó para
                   "libre", y la acción principal es la misma en todo el sitio. -->
              <button
                matButton="filled"
                #confirmar
                type="submit"
                [disabled]="enviando()"
                [attr.aria-busy]="enviando()"
              >
                {{ enviando() ? 'Enviando…' : esSocio() ? 'Reservar' : 'Ir a pagar' }}
              </button>
            </div>
          </form>
        </section>
      </mat-dialog-content>
    </ng-template>
  `,
  styles: `
    dialog {
      /* El diálogo nativo se centra solo; a 375px se pega abajo, que es donde llega
         el pulgar. */
      margin: auto auto 0;
    }

    @media (min-width: 640px) {
      dialog {
        margin: auto;
      }
    }
  `,
})
export class Reservar {
  protected readonly errorDelCampo = errorDelCampo;

  readonly cancha = input.required<Cancha>();
  readonly bloque = input.required<BloqueDisponible>();

  readonly cerrar = output<void>();
  /** El folio y el token de la reserva recién creada, para la confirmación. */
  readonly reservado = output<{ folio: string; token: string }>();

  private readonly dialogo = viewChild.required<TemplateRef<unknown>>('dialogo');

  /**
   * Abierto mientras exista, y otra vez con cada bloque: la grilla reusa este componente al
   * elegir otro —cambia el input, no se vuelve a crear—, y cerrado no se reabriría nunca más.
   */
  private readonly abierto = linkedSignal(() => {
    this.bloque();
    return true;
  });

  private readonly auth = inject(Auth);
  private readonly reservas = inject(Reservas);
  private readonly fb = inject(FormBuilder);

  protected readonly esSocio = computed(
    () => this.auth.usuario()?.socioId != null,
  );

  protected readonly acompanantes = signal<AcompananteNuevo[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);

  private readonly campoDeAcompanantes = viewChild.required(CampoDeAcompanantes);
  private readonly confirmar =
    viewChild.required('confirmar', { read: ElementRef<HTMLButtonElement> });
  private readonly injector = inject(Injector);

  /**
   * Los socios del club, para sugerirlos.
   *
   * Solo se pide si quien mira es socio: el visitante no ve el padrón y el endpoint le
   * respondería 403.
   */
  protected readonly socios = resource({
    params: () => (this.esSocio() ? {} : undefined),
    loader: () => this.reservas.socios(),
    defaultValue: [],
  });

  /** Los invitados que el socio declaró antes (T106), también para sugerirlos. */
  private readonly invitadosAnteriores = resource({
    params: () => (this.esSocio() ? {} : undefined),
    loader: () => this.reservas.misInvitados(),
    defaultValue: [],
  });

  /**
   * Las listas cargadas, leídas sin reventar: `value()` lanza si el resource falló, y la de
   * socios que no cargó se avisa aparte.
   */
  protected readonly sociosSeguros = computed(() =>
    this.socios.hasValue() ? this.socios.value() : [],
  );
  protected readonly invitadosSeguros = computed(() =>
    this.invitadosAnteriores.hasValue() ? this.invitadosAnteriores.value() : [],
  );

  constructor() {
    // En el teléfono, una hoja pegada abajo y a todo el ancho, que es donde está el pulgar;
    // en escritorio, un modal al centro.
    const telefono = inject(BreakpointObserver).isMatched('(max-width: 639px)');
    dialogoSegun(
      this.abierto,
      this.dialogo,
      () => {
        this.abierto.set(false);
        this.cerrar.emit();
      },
      telefono
        ? { position: { bottom: '0' }, width: '100%', maxWidth: '100%' }
        : { width: '28rem', maxWidth: '92vw' },
    );

    // Quien ya entró —con Google o con su contraseña— no vuelve a teclear lo que su
    // cuenta ya sabe. Solo mientras no haya tocado nada: si empezó a corregir el
    // correo, el suyo gana. El teléfono llega vacío desde Google, que no lo entrega,
    // y ese sí queda por escribir.
    effect(() => {
      const yo = this.auth.usuario();

      if (!yo || this.formulario.dirty) return;

      this.formulario.patchValue({
        nombre: `${yo.nombre} ${yo.apellido}`.trim(),
        email: yo.email,
        telefono: yo.telefono ?? '',
      });
    });
  }

  protected readonly formulario = this.fb.nonNullable.group({
    nombre: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    telefono: ['', [Validators.required]],
  });

  /** Con los tres declarados, el foco va al botón de reservar: no queda nada más que escribir. */
  protected enfocarConfirmar(): void {
    afterNextRender(() => this.confirmar().nativeElement.focus(), { injector: this.injector });
  }

  protected async enviar(): Promise<void> {
    this.error.set(null);

    // "Agregar" es un paso que se salta fácil: lo escrito a la vista también cuenta.
    this.campoDeAcompanantes().agregarLoEscrito();
    this.error.set(null);

    if (!this.esSocio() && this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      this.error.set('Revisa tu nombre, correo y teléfono.');
      return;
    }

    if (this.acompanantes().length === 0) {
      this.error.set('Escribe con quién vas a jugar: al menos una persona.');
      return;
    }

    this.enviando.set(true);

    try {
      if (this.esSocio()) {
        const reserva = await this.reservas.reservarComoSocio({
          canchaId: this.cancha().id,
          inicio: this.bloque().inicio,
          // La duración la dice el bloque: la grilla lo pidió de 1 hora o de 1 hora y media.
          duracionMin: minutosDe(this.bloque()),
          acompanantes: this.acompanantes(),
        });

        this.reservado.emit({ folio: reserva.folio, token: reserva.token });
      } else {
        const pago = await this.reservas.reservarComoNoSocio({
          canchaId: this.cancha().id,
          inicio: this.bloque().inicio,
          duracionMin: minutosDe(this.bloque()),
          ...this.formulario.getRawValue(),
          acompanantes: this.acompanantes().flatMap(({ nombre }) =>
            nombre ? [{ nombre }] : [],
          ),
        });

        // A la pasarela por POST: Webpay no abre el formulario de pago con un GET.
        irAPagar(pago);
      }
    } catch (falla) {
      this.error.set(mensajeDeRechazo(falla).mensaje);
    } finally {
      this.enviando.set(false);
    }
  }

  protected readonly hora = horaEnElClub;
  protected readonly pesos = enPesos;
}
