import {
  Component,
  effect,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Auth } from '../core/auth/auth';
import { BloqueDisponible, Cancha } from '../catalogo-canchas/disponibilidad';
import { enPesos, horaEnElClub } from '../catalogo-canchas/reloj-del-club';
import {
  AcompananteNuevo,
  mensajeDeRechazo,
  Reservas,
} from './reservas.service';

/**
 * El formulario de reserva, para socio y para visitante.
 *
 * Es uno solo y no dos porque la mitad de arriba —qué cancha, qué hora, qué cuesta—
 * es idéntica, y lo que cambia es qué hace falta declarar: el socio dice con quién
 * juega, el visitante dice cómo ubicarlo y paga.
 */
@Component({
  selector: 'app-reservar',
  imports: [ReactiveFormsModule],
  template: `
    <!-- Elemento dialog nativo y no un div con overlay: el navegador se encarga del
         foco atrapado, del cierre con Escape, del fondo inerte y del backdrop.
         Hacerlo a mano son treinta líneas de JS que además hay que mantener
         accesibles. Ojo: sin acentos graves acá adentro, que cierran el template. -->
    <!-- En el template, "dialogo" es esta referencia y no el viewChild: la
         referencia gana, y por eso acá se llama close() directo sobre el elemento. -->
    <dialog
      #dialogo
      aria-labelledby="titulo-reserva"
      class="w-full max-w-md rounded-t-2xl bg-card p-5 shadow-lg backdrop:bg-black/40 sm:rounded-2xl"
      (close)="cerrar.emit()"
    >
      <section>
        <h2 id="titulo-reserva" class="font-display text-xl font-bold">
          {{ esSocio() ? 'Reservar tu hora' : 'Reservar y pagar' }}
        </h2>

        <p class="mt-1 text-muted-foreground">
          {{ cancha().nombre }} · {{ hora(bloque().inicio) }}–{{ hora(bloque().fin) }}
        </p>

        @if (!esSocio()) {
          <p class="mt-2 font-display text-2xl font-bold text-accent-strong">
            {{ pesos(bloque().montoClp) }}
          </p>
        }

        <form class="mt-4 space-y-4" [formGroup]="formulario" (ngSubmit)="enviar()">
          @if (esSocio()) {
            <fieldset class="space-y-3">
              <legend class="text-sm font-medium">¿Con quién vas a jugar?</legend>
              <p class="text-sm text-muted-foreground">
                Otro socio no gasta cupo. Un invitado descuenta de tus invitados
                del mes.
              </p>

              @for (acompanante of acompanantes(); track $index) {
                <div class="flex items-center gap-2">
                  <span class="flex-1 rounded-lg border border-border px-3 py-2 text-sm">
                    {{ acompanante.numeroSocio ? 'Socio ' + acompanante.numeroSocio : acompanante.nombre }}
                  </span>
                  <button
                    type="button"
                    class="cursor-pointer rounded-lg px-3 py-2 text-sm underline"
                    (click)="quitar($index)"
                  >
                    Quitar
                  </button>
                </div>
              }

              <div class="flex flex-wrap gap-2">
                <select
                  class="rounded-lg border border-border bg-card px-3 py-2"
                  [value]="tipo()"
                  (change)="cambiarTipo($event)"
                  aria-label="Tipo de acompañante"
                >
                  <option value="invitado">Invitado</option>
                  <option value="socio">Socio del club</option>
                </select>
                <input
                  class="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2"
                  [placeholder]="tipo() === 'socio' ? 'Número de socio' : 'Nombre y apellido'"
                  [attr.aria-label]="tipo() === 'socio' ? 'Número de socio' : 'Nombre del invitado'"
                  [value]="porAgregar()"
                  (input)="porAgregar.set($any($event.target).value)"
                />
                <button
                  type="button"
                  class="cursor-pointer rounded-lg bg-muted px-3 py-2 font-medium disabled:cursor-not-allowed"
                  [disabled]="porAgregar().trim() === ''"
                  (click)="agregar()"
                >
                  Agregar
                </button>
              </div>
            </fieldset>
          } @else {
            <div>
              <label for="nombre" class="block text-sm font-medium">Nombre</label>
              <input
                id="nombre"
                formControlName="nombre"
                autocomplete="name"
                class="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2"
              />
            </div>
            <div>
              <label for="email" class="block text-sm font-medium">Correo</label>
              <input
                id="email"
                type="email"
                formControlName="email"
                autocomplete="email"
                class="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2"
              />
            </div>
            <div>
              <label for="telefono" class="block text-sm font-medium">Teléfono</label>
              <input
                id="telefono"
                formControlName="telefono"
                autocomplete="tel"
                class="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2"
              />
            </div>
          }

          @if (error()) {
            <!-- El mensaje del servidor tal cual: ya viene escrito para la persona,
                 con el límite y cuándo se renueva. -->
            <p role="alert" class="rounded-lg bg-destructive/10 p-3 text-destructive">
              {{ error() }}
            </p>
          }

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="cursor-pointer rounded-lg px-4 py-2 font-medium"
              (click)="dialogo.close()"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="cursor-pointer rounded-lg bg-accent-strong px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              [disabled]="enviando()"
            >
              {{ enviando() ? 'Enviando…' : esSocio() ? 'Reservar' : 'Ir a pagar' }}
            </button>
          </div>
        </form>
      </section>
    </dialog>
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
  readonly cancha = input.required<Cancha>();
  readonly bloque = input.required<BloqueDisponible>();

  readonly cerrar = output<void>();
  /** El folio y el token de la reserva recién creada, para la confirmación. */
  readonly reservado = output<{ folio: string; token: string }>();

  private readonly dialogo =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  private readonly auth = inject(Auth);
  private readonly reservas = inject(Reservas);
  private readonly fb = inject(FormBuilder);

  protected readonly esSocio = computed(
    () => this.auth.usuario()?.socioId != null,
  );

  protected readonly acompanantes = signal<AcompananteNuevo[]>([]);
  protected readonly tipo = signal<'invitado' | 'socio'>('invitado');
  protected readonly porAgregar = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);

  constructor() {
    // `showModal()` y no el atributo `open`: solo la primera vuelve el resto de la
    // página inerte y atrapa el foco.
    //
    // En un `effect` y no en `afterNextRender`: la grilla reusa este componente al
    // elegir otro bloque —cambia el input, no se vuelve a crear—, y con un
    // enganche de una sola vez el diálogo no se reabría nunca más. El efecto
    // depende del bloque, así que cada elección lo vuelve a mostrar.
    effect(() => {
      this.bloque();
      const elemento = this.dialogo().nativeElement;

      if (!elemento.open) elemento.showModal();
    });
  }

  protected readonly formulario = this.fb.nonNullable.group({
    nombre: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    telefono: ['', [Validators.required]],
  });

  protected agregar(): void {
    const valor = this.porAgregar().trim();
    if (valor === '') return;

    this.acompanantes.update((lista) => [
      ...lista,
      this.tipo() === 'socio' ? { numeroSocio: valor } : { nombre: valor },
    ]);
    this.porAgregar.set('');
  }

  protected quitar(indice: number): void {
    this.acompanantes.update((lista) => lista.filter((_, i) => i !== indice));
  }

  protected cambiarTipo(evento: Event): void {
    this.tipo.set(
      (evento.target as HTMLSelectElement).value === 'socio' ? 'socio' : 'invitado',
    );
  }

  protected async enviar(): Promise<void> {
    this.error.set(null);

    if (!this.esSocio() && this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      this.error.set('Revisa tu nombre, correo y teléfono.');
      return;
    }

    this.enviando.set(true);

    try {
      if (this.esSocio()) {
        const reserva = await this.reservas.reservarComoSocio({
          canchaId: this.cancha().id,
          inicio: this.bloque().inicio,
          acompanantes: this.acompanantes(),
        });

        this.reservado.emit({ folio: reserva.folio, token: reserva.token });
      } else {
        const pago = await this.reservas.reservarComoNoSocio({
          canchaId: this.cancha().id,
          inicio: this.bloque().inicio,
          ...this.formulario.getRawValue(),
        });

        // A la pasarela con `location.href`: es una navegación fuera de la SPA y el
        // router de Angular no la haría.
        globalThis.location.href = pago.urlRedireccion;
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
