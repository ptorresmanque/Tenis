import {
  afterNextRender,
  Component,
  effect,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Auth } from '../core/auth/auth';
import { irAPagar } from '../core/pagos/ir-a-pagar';
import { BloqueDisponible, Cancha } from '../catalogo-canchas/disponibilidad';
import { enPesos, horaEnElClub, minutosDe } from '../catalogo-canchas/reloj-del-club';
import {
  AcompananteNuevo,
  mensajeDeRechazo,
  Reservas,
  SocioDelDirectorio,
} from './reservas.service';

/** El mismo tope que la API (`MAXIMO_ACOMPANANTES` en `reservas.dto.ts`, T105). */
const MAXIMO_ACOMPANANTES = 3;

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
      class="dialogo-hoja w-full max-w-md rounded-t-2xl bg-card p-5 shadow-lg
             backdrop:bg-black/40 sm:rounded-2xl"
      (close)="cerrar.emit()"
    >
      <section>
        <h2 id="titulo-reserva" class="titular text-2xl">
          {{ esSocio() ? 'Reservar tu hora' : 'Reservar y pagar' }}
        </h2>

        <p class="mt-1 text-muted-foreground">
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
            <div>
              <label for="nombre" class="block text-sm font-medium">Nombre</label>
              <input
                id="nombre"
                formControlName="nombre"
                autocomplete="name"
                class="campo mt-1"
              />
            </div>
            <div>
              <label for="email" class="block text-sm font-medium">Correo</label>
              <input
                id="email"
                type="email"
                formControlName="email"
                autocomplete="email"
                class="campo mt-1"
              />
            </div>
            <div>
              <label for="telefono" class="block text-sm font-medium">Teléfono</label>
              <input
                id="telefono"
                formControlName="telefono"
                autocomplete="tel"
                class="campo mt-1"
              />
            </div>
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

            <!-- Cómo se leyó cada nombre, a la vista: un socio escrito a mano que quedó
                 como invitado se corrige acá, antes de gastar cupo. -->
            @for (acompanante of acompanantes(); track $index) {
              <div class="flex items-center gap-2">
                <span class="flex-1 border border-border px-3 py-2 text-sm font-semibold">
                  {{ etiqueta(acompanante) }}
                </span>
                <button
                  type="button"
                  class="boton boton-texto boton-chico"
                  (click)="quitar($index)"
                >
                  Quitar<span class="sr-only"> a {{ etiqueta(acompanante) }}</span>
                </button>
              </div>
            }

            @if (acompanantes().length < maximo) {
              <div class="flex flex-wrap gap-2">
                <!-- datalist y no un combobox hecho a mano: el navegador trae el filtro
                     mientras se escribe, el teclado y el lector de pantalla. El socio va
                     con su número porque dos pueden llamarse igual. Enter agrega y no
                     envía: con el formulario, Enter reservaba con la mitad escrita. -->
                <input
                  #campo
                  id="acompanante"
                  class="campo w-auto min-w-0 flex-1"
                  autocomplete="off"
                  placeholder="Nombre y apellido"
                  [attr.aria-label]="
                    esSocio() ? 'Nombre de un socio o de un invitado' : 'Nombre de quien juega contigo'
                  "
                  [attr.list]="esSocio() ? 'sugerencias-acompanante' : null"
                  [value]="porAgregar()"
                  (input)="porAgregar.set($any($event.target).value)"
                  (keydown.enter)="$event.preventDefault(); agregar()"
                />
                @if (esSocio()) {
                  <datalist id="sugerencias-acompanante">
                    @for (sugerencia of sugerencias(); track sugerencia.valor) {
                      <option [value]="sugerencia.valor" [label]="sugerencia.tipo"></option>
                    }
                  </datalist>
                }
                <button
                  type="button"
                  class="boton boton-secundario"
                  [disabled]="porAgregar().trim() === ''"
                  (click)="agregar()"
                >
                  Agregar
                </button>
              </div>
            } @else {
              <p class="text-sm text-muted-foreground">
                Listo: {{ maximo }} es el máximo por reserva.
              </p>
            }

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
            <button type="button" class="boton boton-texto" (click)="dialogo.close()">
              Cancelar
            </button>
            <!-- Primario y no verde (decisión 6 del plan): el verde quedó para
                 "libre", y la acción principal es la misma en todo el sitio. -->
            <button
              #confirmar
              type="submit"
              class="boton boton-primario"
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
  protected readonly porAgregar = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly maximo = MAXIMO_ACOMPANANTES;

  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');
  private readonly confirmar = viewChild.required<ElementRef<HTMLButtonElement>>('confirmar');
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
   * Los que todavía no están en la lista: agregar dos veces al mismo no es válido.
   *
   * `hasValue` antes de `value`: un resource que falló lanza al leerlo, aunque tenga valor
   * por defecto.
   */
  private readonly sociosDisponibles = computed(() => {
    const puestos = new Set(
      this.acompanantes()
        .map((acompanante) => acompanante.numeroSocio)
        .filter((numero) => numero !== undefined),
    );
    const socios = this.socios.hasValue() ? this.socios.value() : [];

    return socios.filter((socio) => !puestos.has(socio.numeroSocio));
  });

  /** Lo que sugiere el campo: los socios que quedan y los invitados anteriores que faltan. */
  protected readonly sugerencias = computed(() => {
    const puestos = new Set(
      this.acompanantes().flatMap(({ nombre }) => (nombre ? [clave(nombre)] : [])),
    );
    const invitados = this.invitadosAnteriores.hasValue()
      ? this.invitadosAnteriores.value()
      : [];

    return [
      ...this.sociosDisponibles().map((socio) => ({
        valor: comoSugerencia(socio),
        tipo: 'Socio del club',
      })),
      ...invitados
        .filter((nombre) => !puestos.has(clave(nombre)))
        .map((nombre) => ({ valor: nombre, tipo: 'Invitado anterior' })),
    ];
  });

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

  /**
   * Agrega lo escrito: el socio que nombra, si nombra a uno, y si no, un invitado. Después
   * el foco vuelve al campo para el siguiente, o al botón de reservar si ya son tres.
   */
  protected agregar(): void {
    const valor = this.porAgregar().trim().replace(/\s+/g, ' ');
    if (valor === '' || this.acompanantes().length >= MAXIMO_ACOMPANANTES) return;

    const socio = this.esSocio() ? this.socioQueNombra(valor) : undefined;

    this.acompanantes.update((lista) => [
      ...lista,
      socio ? { numeroSocio: socio.numeroSocio } : { nombre: valor },
    ]);
    this.porAgregar.set('');
    this.error.set(null);

    afterNextRender(
      () => (this.campo() ?? this.confirmar()).nativeElement.focus(),
      { injector: this.injector },
    );
  }

  /**
   * El socio que lo escrito nombra: el de la sugerencia elegida, o el único que se llama
   * así. Escrito a mano sigue siendo socio: como invitado le gastaría cupo por alguien
   * que no lo gasta. Si dos se llaman igual, sin el número no se sabe cuál, y queda como
   * invitado a la vista de la lista para corregirlo.
   */
  private socioQueNombra(valor: string): SocioDelDirectorio | undefined {
    const disponibles = this.sociosDisponibles();
    const elegido = disponibles.find((socio) => comoSugerencia(socio) === valor);
    if (elegido) return elegido;

    const homonimos = disponibles.filter((socio) => clave(socio.nombre) === clave(valor));

    return homonimos.length === 1 ? homonimos[0] : undefined;
  }

  protected quitar(indice: number): void {
    this.acompanantes.update((lista) => lista.filter((_, i) => i !== indice));
  }

  /**
   * Cómo se lee un acompañante ya agregado. Al socio se lo nombra con su número; al
   * invitado se lo marca, para que se vea cómo quedó leído lo que se escribió.
   */
  protected etiqueta(acompanante: AcompananteNuevo): string {
    if (!acompanante.numeroSocio) {
      return this.esSocio() ? `${acompanante.nombre} · invitado` : (acompanante.nombre ?? '');
    }

    const socios = this.socios.hasValue() ? this.socios.value() : [];
    const socio = socios.find((candidato) => candidato.numeroSocio === acompanante.numeroSocio);

    return socio
      ? `${socio.nombre} · socio N.º ${acompanante.numeroSocio}`
      : `Socio N.º ${acompanante.numeroSocio}`;
  }

  protected async enviar(): Promise<void> {
    this.error.set(null);

    // "Agregar" es un paso que se salta fácil: lo escrito a la vista también cuenta.
    if (this.porAgregar().trim() !== '') this.agregar();

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

/** Cómo se sugiere un socio: con su número, porque dos pueden llamarse igual. */
function comoSugerencia(socio: SocioDelDirectorio): string {
  return `${socio.nombre} · N.º ${socio.numeroSocio}`;
}

/** Un nombre sin mayúsculas, tildes ni espacios de más, para compararlo con otro. */
function clave(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/g, ' ');
}
