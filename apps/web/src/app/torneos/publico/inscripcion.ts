import { BreakpointObserver } from '@angular/cdk/layout';
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
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatRadioModule } from '@angular/material/radio';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { map } from 'rxjs';

import { errorDelCampo, proveerCampos } from '../../ui/campos';
import { Auth, UsuarioActual } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { irAPagar } from '../../core/pagos/ir-a-pagar';
import { Aviso } from '../../ui/aviso';
import { CategoriaPublica, InscripcionHecha, Torneos } from '../torneos.service';
import { recordarPagoPendiente } from './pago-pendiente';
import { Franja, franjasParaLaApi, RestriccionHoraria } from './restriccion-horaria';
import { TelefonoDirective } from '../../ui/telefono';

/**
 * Cómo terminó una inscripción que no pasa por Webpay, como lo dice `?pago=` en Torneos
 * (`AVISOS_DEL_PAGO`): en la lista de espera, con el comprobante por revisar, o inscrita.
 */
function comoTermino(hecha: InscripcionHecha): 'espera' | 'comprobante' | 'inscrito' {
  if (hecha.estado === 'LISTA_ESPERA') return 'espera';
  return hecha.estadoPago === 'PENDIENTE' ? 'comprobante' : 'inscrito';
}

/** El formulario vacío. Función y no constante, para no compartir el objeto. */
const enBlanco = () => ({
  nombre: '',
  apellido: '',
  telefono: '',
  procedencia: '',
  email: '',
  /** Nula hasta que se elige: con un cero, `required` la daba por elegida. */
  categoriaJuegoId: null as number | null,
  /** Vacío hasta que la persona elige. Solo se pregunta si la categoría cobra. */
  medioPago: '' as '' | 'WEBPAY' | 'TRANSFERENCIA',
});

/**
 * Inscribirse a un torneo **sin cuenta**.
 *
 * Revierte "inscribirse sigue siendo cosa del admin": el torneo lo juegan externos de
 * otros clubes que no tienen ni van a tener cuenta acá, y pedirles registro para
 * anotarse era la barrera que el club quiso sacar.
 *
 * **Esta pantalla no decide nada.** Si queda cupo, si la inscripción sigue abierta, si
 * el cuadro ya se armó: todo lo resuelve el servidor y esto muestra lo que respondió.
 * Adivinarlo acá produciría un formulario que dice "quedan 2 cupos" y un servidor que
 * responde otra cosa.
 */
@Component({
  selector: 'app-inscripcion-a-torneo',
  imports: [
    MatRadioModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    MatStepperModule,
    FormsModule,
    RouterLink,
    Aviso,
    RestriccionHoraria,
    TelefonoDirective,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- La forma de la A (TV4.2): la caja con sombra y sin borde. Desde T317 (D4 y A7) los
         campos van en tres pasos, con los mismos campos, envío y pago de antes: un paso
         incompleto no deja seguir, y lo que falta lo dice su campo. Los tres pasos van en
         un mismo form, y cada uno valida su grupo (ngModelGroup). La caja es el stepper,
         que ya trae su fondo y su relleno: con los del form quedaba una caja dentro de otra.
         Un «Siguiente» lleno por paso: se ve un paso a la vez, y el último lleno es el envío. -->
    <form class="mt-4 shadow-md" (ngSubmit)="alEnviar()">
      <mat-stepper
        linear
        aria-label="Inscripción al torneo"
        [orientation]="enTelefono() ? 'vertical' : 'horizontal'"
      >
        <!-- Completo también si se inscribe como socio: el form saca del grupo los campos que se
             fueron en una microtarea, y hasta entonces el paso seguía inválido y no dejaba pasar. -->
        <mat-step
          label="Tus datos"
          aria-label="Paso 1 de 3: tus datos"
          [stepControl]="jugador.control"
          [completed]="comoSocio() || !!jugador.valid"
        >
          <div ngModelGroup="jugador" #jugador="ngModelGroup" class="pt-2">
            @if (comoSocio()) {
              <p class="max-w-prose text-sm text-muted-foreground">
                Te inscribes como socio, con los datos de tu cuenta: elige la categoría,
                dinos si hay horarios en que no puedas jugar y paga la inscripción.
              </p>
              <button
                matButton
                type="button"
                class="chico mt-1"
                (click)="cambiarModo(false)"
              >
                Inscribir a otra persona
              </button>
            } @else {
              <p class="max-w-prose text-sm text-muted-foreground">
                No hace falta tener cuenta. El club te llama a este teléfono si hay algún
                cambio. Ni el teléfono ni el correo se publican en ninguna parte.
              </p>
              <!-- **El socio se salta los datos** (T129, punto 5): el club ya los tiene. Paga
                   igual que cualquiera (decisión 5). -->
              @if (esSocio()) {
                <div
                  class="mt-3 flex flex-wrap items-center justify-between gap-3 border
                         border-primary/30 bg-primary/5 p-3"
                >
                  <p class="text-sm">Eres socio: tus datos ya los tenemos.</p>
                  <!-- De contorno: el lleno del formulario es el envío (T241). -->
                  <button
                    matButton="outlined"
                    type="button"
                    class="chico"
                    (click)="cambiarModo(true)"
                  >
                    Inscribirse como socio
                  </button>
                </div>
              }
              @if (precargado()) {
                <p class="mt-1 max-w-prose text-sm text-muted-foreground">
                  Llenamos el formulario con los datos de tu cuenta. Si inscribes a otra
                  persona, cámbialos por los suyos.
                </p>
              }

              <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <mat-form-field>
                  <mat-label>Nombre <span aria-hidden="true">*</span></mat-label>
                  <input
                    matInput
                    #nombre="ngModel"
                    name="nombre"
                    autocomplete="given-name"
                    maxlength="80"
                    required
                    [(ngModel)]="datos.nombre"
                  />
                  <mat-error>{{ errorDelCampo(nombre.control) }}</mat-error>
                </mat-form-field>

                <mat-form-field>
                  <mat-label>Apellidos <span aria-hidden="true">*</span></mat-label>
                  <input
                    matInput
                    #apellido="ngModel"
                    name="apellido"
                    autocomplete="family-name"
                    maxlength="80"
                    required
                    [(ngModel)]="datos.apellido"
                  />
                  <mat-error>{{ errorDelCampo(apellido.control) }}</mat-error>
                </mat-form-field>

                <mat-form-field>
                  <mat-label>Teléfono <span aria-hidden="true">*</span></mat-label>
                  <span matTextPrefix>+56&nbsp;</span>
                  <input
                    matInput
                    appTelefono
                    #telefono="ngModel"
                    name="telefono"
                    required
                    [(ngModel)]="datos.telefono"
                  />
                  <mat-error>{{ errorDelCampo(telefono.control) }}</mat-error>
                  <mat-hint>Con el que el club te puede llamar. Por ejemplo +56 9 8765 4321.</mat-hint>
                </mat-form-field>

                <mat-form-field>
                  <mat-label>Correo <span aria-hidden="true">*</span></mat-label>
                  <!-- La misma forma que exige el servidor (leerCorreo), con los espacios de
                       los bordes, que se recortan al mandar. -->
                  <input
                    matInput
                    #correo="ngModel"
                    type="email"
                    name="email"
                    autocomplete="email"
                    maxlength="191"
                    required
                    [pattern]="CORREO"
                    [(ngModel)]="datos.email"
                  />
                  <mat-error>
                    {{
                      correo.hasError('required')
                        ? 'Falta este dato.'
                        : 'Revisa tu correo: ahí te llega la confirmación de la inscripción.'
                    }}
                  </mat-error>
                  <mat-hint>
                    Te escribimos a este correo para confirmar tu inscripción y avisarte de tus partidos.
                  </mat-hint>
                </mat-form-field>

                <mat-form-field>
                  <mat-label>Club o de dónde vienes <span aria-hidden="true">*</span></mat-label>
                  <input
                    matInput
                    #procedencia="ngModel"
                    name="procedencia"
                    maxlength="120"
                    required
                    [(ngModel)]="datos.procedencia"
                  />
                  <mat-error>{{ errorDelCampo(procedencia.control) }}</mat-error>
                  <mat-hint>Si no juegas en un club, escribe tu comuna.</mat-hint>
                </mat-form-field>
              </div>
            }
          </div>

          <div class="mt-4 flex flex-wrap gap-3">
            <button matButton="filled" matStepperNext type="button">Siguiente</button>
          </div>
        </mat-step>

        <mat-step label="Categoría" aria-label="Paso 2 de 3: categoría" [stepControl]="eleccion.control">
          <div ngModelGroup="eleccion" #eleccion="ngModelGroup" class="pt-2">
            <mat-form-field class="w-full">
              <mat-label>Categoría <span aria-hidden="true">*</span></mat-label>
              <mat-select name="categoria" required [(ngModel)]="datos.categoriaJuegoId">
                <!-- Solo las que corre **este** torneo: ofrecer las seis del club
                     produciría una inscripción a un cuadro que no existe. -->
                @for (categoria of categorias(); track categoria.id) {
                  <mat-option [value]="categoria.categoriaJuegoId">
                    {{ categoria.categoria }} — {{ precio(categoria.montoClp) }}
                    @if (categoria.cuposLibres === 0) {
                      — sin cupos, quedarías en lista de espera
                    }
                  </mat-option>
                }
              </mat-select>
              <mat-error>Elige la categoría en la que vas a jugar.</mat-error>
            </mat-form-field>
          </div>

          <app-restriccion-horaria [(franjas)]="franjas" />

          <div class="mt-4 flex flex-wrap gap-3">
            <button matButton matStepperPrevious type="button">Atrás</button>
            <button matButton="filled" matStepperNext type="button">Siguiente</button>
          </div>
        </mat-step>

        <mat-step label="Pago" aria-label="Paso 3 de 3: pago">
          <!-- Lo que se va a mandar, antes de mandarlo. -->
          <p class="max-w-prose pt-2 font-semibold">{{ resumen() }}</p>

          <!-- **El pago se elige acá, no después.** Antes la inscripción se creaba y el
               pago quedaba en un panel que se podía cerrar: el cupo se llenaba con gente
               que nunca pagó. Ahora el comprobante viaja en el mismo envío y el servidor
               rechaza la inscripción que llega sin él. -->
          @if (quedaEnEspera()) {
            <!-- **En espera no se cobra** (T328, SPEC-torneos.md § Lista de espera sin cobro): si
                 nunca se abre un cupo, no hay plata que devolver. Lo decide el servidor; esto
                 solo no pregunta lo que no se va a usar. -->
            <app-aviso variante="aviso" class="mt-4 block">
              Esta categoría está llena: quedas en la lista de espera, sin pagar nada. Si se abre
              un cupo, te avisamos por correo para que lo tomes.
            </app-aviso>
          } @else if (montoElegido() > 0) {
            <fieldset class="mt-4 border border-border p-4">
              <legend
                id="como-vas-a-pagar"
                class="px-1 font-display text-sm font-bold tracking-wide uppercase"
              >
                Cómo vas a pagar los {{ enPesos(montoElegido()) }}
              </legend>

              <p class="max-w-prose text-sm text-muted-foreground">
                Sin pago no hay inscripción: tu lugar queda tomado cuando pagas o cuando
                subes el comprobante de tu transferencia.
              </p>

              <!-- Cada medio es una opción que se toca entera, no solo el círculo: la caja es
                   la etiqueta. La elegida se marca con el borde (opcion-tarjeta, en el tema). -->
              <mat-radio-group
                class="mt-3 grid gap-2"
                name="medioPago"
                aria-labelledby="como-vas-a-pagar"
                [(ngModel)]="datos.medioPago"
              >
                <mat-radio-button class="opcion-tarjeta" value="WEBPAY">
                  Pagar ahora con Webpay
                </mat-radio-button>
                <mat-radio-button class="opcion-tarjeta" value="TRANSFERENCIA">
                  Ya transferí y adjunto el comprobante
                </mat-radio-button>
              </mat-radio-group>

              @if (datos.medioPago === 'TRANSFERENCIA') {
                <!-- Material no tiene campo de archivo, y matInput no admite type="file": el
                     nativo, con su etiqueta y su ayuda conectadas como en los demás (T245). -->
                <label class="mt-3 grid gap-1.5">
                  <span class="text-sm font-semibold">
                    Comprobante de la transferencia <span aria-hidden="true">*</span>
                  </span>
                  <input
                    class="rounded-control border border-border bg-card p-3 text-sm"
                    type="file"
                    name="comprobante"
                    accept="image/jpeg,image/png"
                    aria-describedby="comprobante-ayuda"
                    (change)="elegirComprobante($event)"
                  />
                  <span id="comprobante-ayuda" class="text-xs text-muted-foreground">
                    Una foto o captura, JPG o PNG.
                  </span>
                </label>
              }
            </fieldset>
          }

          <!-- Inscribirse es consentir la publicación (decidido por el club el
               2026-10-07), así que se dice antes del botón y no en la letra chica. -->
          <p class="mt-4 max-w-prose text-sm text-muted-foreground">
            En el sitio se publican tu nombre, tus resultados, las fotos y las transmisiones de
            los partidos, y al inscribirte das tu consentimiento para eso. Puedes retirarlo
            cuando quieras: lo explica la
            <a routerLink="/privacidad" target="_blank" class="underline">política de privacidad</a>.
          </p>

          <div class="mt-4 flex flex-wrap gap-3">
            <button matButton matStepperPrevious type="button">Atrás</button>
            <!-- El de Pagar con Webpay va en su propia section, que aparece después de inscribirse.
                 mat-guidelines-ignore: multiples-filled -->
            <button
              matButton="filled"
              type="submit"
              [disabled]="enviando()"
              [attr.aria-busy]="enviando()"
            >
              {{ enviando() ? 'Inscribiendo…' : 'Inscribirme' }}
            </button>
          </div>

          @if (error(); as falla) {
            <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
          }
        </mat-step>
      </mat-stepper>
    </form>

    <!-- **El pago aparece recién después de inscribirse**, y con la llave que devolvió
         el servidor. Antes no hay a qué inscripción cobrarle, y pedir la plata primero
         obligaría a devolverla si el cuadro ya estaba lleno. -->
    @if (porPagar(); as pendiente) {
      <section class="mt-4 border border-primary/30 bg-primary/5 p-5">
        <h2 class="font-display text-lg font-bold tracking-wide uppercase">Falta pagar la inscripción</h2>
        <p class="mt-1 max-w-prose text-sm">
          {{ pendiente.categoria }} cuesta
          <strong>{{ enPesos(pendiente.montoClp) }}</strong>. Tu lugar te espera
          <strong>15 minutos</strong>: si el pago no llega, se libera solo y no
          quedas inscrito.
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-3">
          <button
            matButton="filled"
            type="button"
            [disabled]="pagando()"
            [attr.aria-busy]="pagando()"
            (click)="pagar(pendiente.token)"
          >
            Pagar con Webpay
          </button>

          <!-- matButton no va en una etiqueta: el botón abre el selector del campo escondido. -->
          <button
            matButton="outlined"
            type="button"
            [disabled]="pagando()"
            (click)="comprobante.click()"
          >
            Adjuntar comprobante de transferencia
          </button>
          <input
            #comprobante
            hidden
            type="file"
            accept="image/jpeg,image/png"
            (change)="adjuntar(pendiente.token, $event)"
          />
        </div>

        <p class="mt-2 text-sm text-muted-foreground">
          Si transfieres, sube la imagen y el club la revisa. Hasta que la confirme, tu
          inscripción queda pendiente.
        </p>

        @if (errorPago(); as falla) {
          <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
        }
      </section>
    }
  `,
})
export class InscripcionATorneo {
  protected readonly errorDelCampo = errorDelCampo;

  private readonly api = inject(Torneos);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly torneoId = input.required<number>();
  readonly categorias = input.required<CategoriaPublica[]>();

  /**
   * El servidor rechazó el envío, y los cupos que se mostraron pueden estar viejos (T328): con una
   * categoría que se veía llena y ya tiene lugar, el formulario no preguntaría cómo pagar.
   */
  readonly rechazada = output<void>();

  protected datos = enBlanco();

  /** La forma de correo que exige el servidor (`leerCorreo`), con los espacios de los bordes. */
  protected readonly CORREO = /^\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*$/;

  private readonly pasos = viewChild.required(MatStepper);

  /** En el teléfono los pasos van uno bajo el otro: en fila, sus nombres no caben. */
  protected readonly enTelefono = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 639px)')
      .pipe(map((pantalla) => pantalla.matches)),
    { requireSync: true },
  );

  /** La imagen de la transferencia. Va en el mismo envío que el formulario. */
  protected comprobante: File | null = null;

  /** Cuándo no puede jugar. Vacío es lo normal: casi nadie tiene restricciones. */
  protected readonly franjas = signal<Franja[]>([]);

  /**
   * La inscripción recién hecha que todavía no está pagada.
   *
   * Guarda **su llave**, que es lo único con que quien no tiene cuenta vuelve a ella.
   * Se muestra una vez y no se persiste: si la persona cierra la pestaña, el club la
   * ayuda por teléfono — que es como funciona hoy.
   */
  protected readonly porPagar = signal<{
    token: string;
    montoClp: number;
    categoria: string;
  } | null>(null);

  protected readonly pagando = signal(false);
  protected readonly errorPago = signal<string | null>(null);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Si el formulario llegó con los datos de la cuenta. Se dice, por quien inscribe a otro. */
  protected readonly precargado = signal(false);

  /** Tiene ficha de socio: es lo mismo que exige `@SoloSocio()` en la API. */
  protected readonly esSocio = computed(() => (this.auth.usuario()?.socioId ?? null) !== null);

  /** El socio se salta los datos (T129). Con sesión de socio, llega así (T317, A7). */
  protected readonly comoSocio = signal(false);

  /**
   * Entra o sale del modo socio, y va al paso que sigue: la categoría, o los datos de la otra
   * persona. **Sin perder el foco** (`enfocar`): el botón que se apretó desaparece, y sin esto
   * el foco cae al inicio de la página. Va a lo siguiente que hay que llenar.
   */
  protected cambiarModo(comoSocio: boolean, enfocar = true): void {
    this.comoSocio.set(comoSocio);

    // Primero se dibuja el modo: sin los campos de los datos, su paso queda completo y se
    // puede seguir. El foco va en el render siguiente, cuando el paso ya está a la vista.
    afterNextRender(
      () => {
        this.pasos().selectedIndex = comoSocio ? 1 : 0;
        if (!enfocar) return;

        afterNextRender(
          () =>
            this.host.nativeElement
              .querySelector<HTMLElement>(comoSocio ? '[name="categoria"]' : '[name="nombre"]')
              ?.focus(),
          { injector: this.injector },
        );
      },
      { injector: this.injector },
    );
  }

  /** La categoría elegida en el segundo paso, o ninguna todavía. */
  private elegida(): CategoriaPublica | undefined {
    const id = Number(this.datos.categoriaJuegoId);

    return this.categorias().find((c) => c.categoriaJuegoId === id);
  }

  /** Si la elegida ya no tiene cupos: quien se inscribe queda en la lista de espera. */
  protected quedaEnEspera(): boolean {
    return this.elegida()?.cuposLibres === 0;
  }

  /** Lo que se va a mandar, al final, antes de mandarlo. */
  protected resumen(): string {
    const elegida = this.elegida();
    if (!elegida) return '';

    const en = `${elegida.categoria}, ${this.precio(elegida.montoClp)}.`;
    if (this.comoSocio()) return `Te inscribes en ${en}`;

    return `Inscribes a ${this.datos.nombre.trim()} ${this.datos.apellido.trim()} en ${en}`;
  }

  /**
   * Enter en un campo envía el formulario. Antes del último paso, eso es seguir al
   * siguiente: mandar desde ahí dejaba el error en un paso que no se veía.
   */
  protected alEnviar(): void {
    const pasos = this.pasos();

    if (pasos.selectedIndex < pasos.steps.length - 1) {
      pasos.next();
      return;
    }

    void this.inscribirse();
  }

  constructor() {
    // **Con sesión de quien no es socio, llega con los datos de su cuenta** (T128). El
    // socio no: su camino es "Inscribirse como socio" (T129). Es un efecto y no una
    // lectura al crear porque `/api/yo` puede responder después de que se abrió el
    // formulario.
    effect(() => {
      const cuenta = this.auth.usuario();

      if (cuenta && cuenta.socioId === null) this.precargar(cuenta);
    });

    // **El socio con sesión empieza en la categoría** (T317, A7): sus datos ya los tiene el
    // club. Sin foco: no lo pidió nadie, y robarlo al abrir la página desorienta.
    effect(() => {
      if (this.esSocio()) untracked(() => this.cambiarModo(true, false));
    });
  }

  /**
   * **Solo lo vacío**: si la sesión llegó tarde, lo que la persona ya escribió se queda.
   * Todo se puede cambiar: un padre inscribe a su hijo con su propia sesión.
   */
  private precargar(cuenta: UsuarioActual): void {
    this.datos.nombre ||= cuenta.nombre;
    this.datos.apellido ||= cuenta.apellido;
    // Nulo para quien entró con Google: ese campo queda para escribirlo.
    this.datos.telefono ||= cuenta.telefono ?? '';
    this.datos.email ||= cuenta.email;
    this.precargado.set(true);
  }

  protected enPesos(monto: number): string {
    return `$${monto.toLocaleString('es-CL')}`;
  }

  /** El precio de una categoría en el selector. Cero es gratis y se dice así. */
  protected precio(montoClp: number): string {
    return montoClp > 0 ? this.enPesos(montoClp) : 'gratis';
  }

  /**
   * Cuánto cuesta la categoría elegida, o cero.
   *
   * Sale de las categorías que mandó el servidor y no de una constante: el monto es
   * del cuadro, así que cambiar de categoría cambia el precio y, con él, si hay que
   * preguntar cómo se paga.
   */
  protected montoElegido(): number {
    return this.elegida()?.montoClp ?? 0;
  }

  protected elegirComprobante(evento: Event): void {
    this.comprobante = (evento.target as HTMLInputElement).files?.[0] ?? null;
  }

  /**
   * Manda a Webpay. La vuelta la maneja el servidor y trae de regreso al sitio.
   *
   * **Con un POST y no con `location.href`.** Webpay abre su formulario de pago solo
   * si esa URL se visita por `POST` llevando `token_ws`; con un `GET` la persona queda
   * mirando una página en blanco, con su cupo tomado y sin forma de pagarlo. Es el
   * mismo `irAPagar` de la cuota y de la reserva, que existía justamente por esto y
   * que este camino no estaba usando.
   */
  protected async pagar(token: string): Promise<void> {
    this.errorPago.set(null);
    this.pagando.set(true);

    try {
      const pago = await this.api.pagarInscripcion(token);

      // **Antes de irse, no después**: al volver de la pasarela esta pestaña ya no
      // tiene el token en memoria, y es lo único con que puede pedir que le suelten el
      // cupo si vuelve sin pagar. Ver `pago-pendiente.ts`.
      recordarPagoPendiente(token);
      irAPagar(pago);
    } catch (falla) {
      this.errorPago.set(
        mensajeDelServidor(falla, 'No se pudo empezar el pago.'),
      );
      this.pagando.set(false);
    }
  }

  /**
   * Termina en Torneos, con el aviso de cómo quedó la inscripción (`?pago=`, T323): como la vuelta
   * de Webpay. Sin entrada en el historial: «atrás» no vuelve al formulario ya mandado.
   */
  private terminarEnTorneos(pago: 'espera' | 'comprobante' | 'inscrito'): void {
    void this.router.navigate(['/torneos'], { queryParams: { pago }, replaceUrl: true });
  }

  protected async adjuntar(token: string, evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];

    if (!archivo) return;

    this.errorPago.set(null);
    this.pagando.set(true);

    try {
      await this.api.subirComprobante(token, archivo);
      // Termina como la transferencia del formulario (T323): en Torneos, con su aviso.
      this.terminarEnTorneos('comprobante');
    } catch (falla) {
      // El del servidor tal cual: dice si la imagen no se pudo leer o si pesa de más.
      this.errorPago.set(
        mensajeDelServidor(falla, 'No se pudo subir el comprobante.'),
      );
    } finally {
      this.pagando.set(false);
    }
  }

  protected async inscribirse(): Promise<void> {
    this.error.set(null);

    // La categoría y el correo ya los revisaron sus pasos (T317): sin ellos no se llega acá.
    // El socio no escribe correo: el servidor usa el de su cuenta.
    const categoriaJuegoId = Number(this.datos.categoriaJuegoId);
    const comoSocio = this.comoSocio();
    const email = this.datos.email.trim();

    // Las dos comprobaciones del pago son **cortesía**: el servidor las repite y es el
    // único que sabe cuánto cobra ese cuadro. Están acá para no hacer viajar la imagen
    // —ni el formulario entero— por algo que se ve sin salir de la pantalla. En la lista de
    // espera no se cobra (T328).
    const cobra = this.montoElegido() > 0 && !this.quedaEnEspera();
    const medioPago = cobra ? this.datos.medioPago : '';

    if (cobra && this.datos.medioPago === '') {
      this.error.set('Elige cómo vas a pagar la inscripción.');
      return;
    }

    if (cobra && this.datos.medioPago === 'TRANSFERENCIA' && !this.comprobante) {
      this.error.set(
        'Adjunta la imagen de tu transferencia: sin el comprobante la inscripción ' +
          'no queda tomada.',
      );
      return;
    }

    this.enviando.set(true);

    try {
      const comprobante =
        medioPago === 'TRANSFERENCIA' ? (this.comprobante ?? undefined) : undefined;

      const hecha = comoSocio
        ? await this.api.inscribirseComoSocio(
            this.torneoId(),
            { categoriaJuegoId, medioPago, restricciones: franjasParaLaApi(this.franjas()) },
            comprobante,
          )
        : await this.api.inscribirseEnTorneo(
            this.torneoId(),
            {
              ...this.datos,
              nombre: this.datos.nombre.trim(),
              apellido: this.datos.apellido.trim(),
              procedencia: this.datos.procedencia.trim(),
              email,
              categoriaJuegoId,
              medioPago,
              restricciones: franjasParaLaApi(this.franjas()),
            },
            comprobante,
          );

      this.datos = enBlanco();
      // Vacío y sin el aviso de la cuenta: el siguiente puede ser otra persona.
      this.precargado.set(false);
      this.comoSocio.set(false);
      this.comprobante = null;
      this.franjas.set([]);
      // De vuelta al primer paso, sin los errores de los campos vacíos.
      this.pasos().reset();

      // **Con Webpay se sigue a la pasarela en el acto**, sin un botón intermedio que
      // se pueda cerrar: es la mitad de "el pago no es un segundo paso" que el servidor
      // no puede imponer, porque cobrar exige que la inscripción ya exista. El panel
      // queda armado debajo, y es lo que se ve si la pasarela no responde. La vuelta de
      // Webpay trae a Torneos, con su aviso. **Solo si entró al cuadro**: si alguien llegó antes y
      // quedó en espera, no se le cobra (T328).
      const aPagar = hecha.estado === 'INSCRITA' && hecha.estadoPago === 'PENDIENTE';
      if (aPagar && medioPago === 'WEBPAY') {
        this.porPagar.set({
          token: hecha.token,
          montoClp: hecha.montoClp,
          categoria: hecha.categoria,
        });
        await this.pagar(hecha.token);
        return;
      }

      // **Sin Webpay se termina igual que con Webpay** (T323): en Torneos, que confirma lo hecho
      // con el snackbar y deja fijo y a la vista lo que hay que leer. Antes era un snackbar que se iba solo y el formulario vacío otra vez, y el aviso
      // de la lista de espera quedaba en el último paso, que ya no se veía. **Lo que se dice es
      // lo que respondió el servidor**: quien quedó en espera tiene que saberlo ahora.
      this.terminarEnTorneos(comoTermino(hecha));
    } catch (falla) {
      // El del servidor tal cual: dice si la inscripción cerró, si el cuadro ya se
      // armó o si esa persona ya está anotada en otra categoría, y esas frases están
      // escritas para leerse.
      this.error.set(
        mensajeDelServidor(falla, 'No se pudo completar la inscripción.'),
      );
      this.rechazada.emit();
    } finally {
      this.enviando.set(false);
    }
  }
}
