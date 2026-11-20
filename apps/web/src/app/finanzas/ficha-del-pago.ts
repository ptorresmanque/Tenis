import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  resource,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink, UrlTree } from '@angular/router';

import {
  diaEnPalabras,
  enPesos,
  fechaEnElClub,
  horaEnElClub,
} from '../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { proveerCampos } from '../ui/campos';
import { dialogoSegun } from '../ui/dialogo';
import { Esqueleto } from '../ui/esqueleto';
import { LO_HECHO } from '../ui/material';
import {
  ESTADO_DEL_PAGO,
  fechaYHoraDelClub,
  medioDelPago,
  TIPO_DE_PAGO,
} from './pagos-en-palabras';
import { ConceptoDelPago, OrigenDelPago, PagosDelClub, PagoWebpay } from './pagos.service';

/** Lo que pide cada acción antes de hacerse, y lo que dice al terminar. */
const ACCIONES = {
  devolver: {
    campo: 'Motivo',
    falta: 'Escribe por qué se devuelve.',
    enviando: 'Devolviendo…',
    hecho: 'Pago devuelto.',
    fallo: 'No se pudo hacer la devolución. Reintenta en un momento.',
  },
  revisar: {
    campo: 'Nota',
    falta: 'Escribe qué revisaste.',
    enviando: 'Guardando…',
    hecho: 'Pago marcado como revisado.',
    fallo: 'No se pudo guardar la revisión. Reintenta en un momento.',
  },
} as const;
type Accion = keyof typeof ACCIONES;

/** El texto del enlace a donde se hace lo que falta primero: dice adónde lleva. */
const IR_A: Record<ConceptoDelPago, string> = {
  RESERVA: 'Ir a la reserva',
  CUOTA: 'Ir a la ficha de la persona',
  INSCRIPCION: 'Ir al torneo',
};

/** El largo que guarda la API (`nota_revision` y `motivo_anulacion`, VarChar 200). */
const LARGO_MAXIMO = 200;

/**
 * La ficha de un pago (T399, `SPEC-panel.md` § Los pagos del club, F5–F8): lo que dijo Webpay,
 * la devolución y la revisión, y a qué corresponde, con su enlace. Del mesón dice quién lo
 * registró y nada más: no pasó por la pasarela, y no hay nada que devolver ni revisar acá.
 *
 * «Devolver» y «Marcar como revisado» confirman dentro de la misma ficha, como «Cancelar
 * reserva» en la de la reserva: nada de un diálogo encima de otro. Las reglas las pone la API; la
 * ficha solo no ofrece lo que la API ya dijo que no.
 *
 * Es todo un diálogo: se abre al crearse y avisa al cerrarse.
 */
@Component({
  selector: 'app-ficha-del-pago',
  imports: [
    Aviso,
    Esqueleto,
    MatButton,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIcon,
    MatIconButton,
    MatInput,
    ReactiveFormsModule,
    RouterLink,
  ],
  providers: [proveerCampos()],
  template: `
    <ng-template #dialogo>
      <div class="flex items-start justify-between gap-2">
        <!-- min-w-0: sin esto, un título largo en el teléfono sacaba de la vista el ícono. -->
        <h2 mat-dialog-title class="min-w-0 flex-1">{{ titulo() }}</h2>
        <!-- «Cerrar» es un ícono con nombre: abajo, dos acciones como máximo (Material, dialog). -->
        <button
          #cerrarFicha
          matIconButton
          type="button"
          mat-dialog-close
          class="m-2 shrink-0"
          aria-label="Cerrar la ficha"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </div>

      @if (ficha.hasValue()) {
        @let laFicha = ficha.value();
        @let fila = laFicha.fila;
        @if (accion(); as laAccion) {
          <mat-dialog-content>
            <p id="consecuencia-de-la-accion">
              {{
                laAccion === 'devolver'
                  ? 'Webpay devuelve el total al mismo medio de pago. No se puede deshacer.'
                  : 'Quedan registrados tu nombre, la fecha y la nota, y no se puede deshacer. El pago deja de aparecer en «Solo por revisar».'
              }}
            </p>
            <mat-form-field class="mt-3 w-full">
              <mat-label>{{ acciones[laAccion].campo }}</mat-label>
              <textarea
                #campo
                matInput
                rows="2"
                [maxlength]="LARGO_MAXIMO"
                [formControl]="texto"
              ></textarea>
              <mat-hint align="end">{{ texto.value.length }}/{{ LARGO_MAXIMO }}</mat-hint>
              <mat-error>{{ acciones[laAccion].falta }}</mat-error>
            </mat-form-field>
            @if (error(); as falla) {
              <!-- El rechazo de la API tal cual, el de Transbank incluido: viene escrito para
                   una persona. -->
              <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
            }
          </mat-dialog-content>
          <mat-dialog-actions align="end">
            <button matButton type="button" (click)="volverALaFicha()">Volver</button>
            <button
              matButton="filled"
              type="button"
              aria-describedby="consecuencia-de-la-accion"
              [disabled]="enviando()"
              [attr.aria-busy]="enviando()"
              (click)="confirmar(laAccion)"
            >
              @if (enviando()) {
                {{ acciones[laAccion].enviando }}
              } @else if (laAccion === 'devolver') {
                Devolver {{ pesos(fila.montoClp) }}
              } @else {
                Marcar como revisado
              }
            </button>
          </mat-dialog-actions>
        } @else {
          <mat-dialog-content>
            <p class="font-display text-lg font-semibold tabular-nums">
              {{ pesos(fila.montoClp) }}
            </p>
            @let insignia = estados[fila.estado];
            <mat-chip-set class="insignias mt-1" aria-label="Estado del pago">
              <mat-chip class="insignia" [class]="insignia.variante">
                <mat-icon matChipAvatar aria-hidden="true">{{ insignia.icono }}</mat-icon>
                {{ insignia.palabra }}
              </mat-chip>
            </mat-chip-set>

            <dl data-pago class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt class="text-muted-foreground">Fecha</dt>
              <dd class="tabular-nums">{{ fechaYHora(fila.fecha) }}</dd>
              <dt class="text-muted-foreground">Quién pagó</dt>
              <dd>{{ fila.quien }} · {{ fila.esSocio ? 'Socio' : 'Visitante' }}</dd>
              <dt class="text-muted-foreground">Medio</dt>
              <dd>{{ medio(fila) }}</dd>
              @if (!laFicha.webpay) {
                <dt class="text-muted-foreground">Registrado por</dt>
                <dd>{{ laFicha.registradaPor ?? 'No se guardó' }}</dd>
              }
            </dl>

            <section data-asociado class="mt-4" aria-labelledby="titulo-asociado">
              <!-- «Concepto», como la columna de la lista: «Asociado a» se leía como «socio». -->
              <h3 id="titulo-asociado" class="font-display text-sm font-bold tracking-wide uppercase">
                Concepto
              </h3>
              @if (enlaceAlAsociado(); as enlace) {
                <a class="mt-1 block text-sm underline" [routerLink]="enlace">
                  {{ laFicha.asociadoA.texto }}
                </a>
              } @else {
                <p class="mt-1 text-sm">{{ laFicha.asociadoA.texto }}</p>
              }
            </section>

            @if (laFicha.webpay; as webpay) {
              <section data-webpay class="mt-4" aria-labelledby="titulo-webpay">
                <h3 id="titulo-webpay" class="font-display text-sm font-bold tracking-wide uppercase">
                  Webpay
                </h3>
                @let falta = webpay.confirmadaEn ? 'No se guardó' : '—';
                <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt class="text-muted-foreground">Orden de compra</dt>
                  <dd class="break-all">{{ webpay.referencia }}</dd>
                  <dt class="text-muted-foreground">Autorización</dt>
                  <dd>{{ webpay.codigoAutorizacion ?? '—' }}</dd>
                  <dt class="text-muted-foreground">Tarjeta</dt>
                  <dd>{{ webpay.ultimosDigitos ? 'terminada en ' + webpay.ultimosDigitos : '—' }}</dd>
                  <!-- Los tres que se guardan desde T395: en un pago anterior, «No se guardó». -->
                  <dt class="text-muted-foreground">Tipo de pago</dt>
                  <dd>{{ tipoDePago(webpay) ?? falta }}</dd>
                  <!-- «Cuotas» a secas se confundía con la cuota del socio. -->
                  <dt class="text-muted-foreground">Cuotas de la tarjeta</dt>
                  <dd>{{ cuotasDe(webpay) ?? falta }}</dd>
                  <dt class="text-muted-foreground">Código de respuesta</dt>
                  <dd>{{ webpay.codigoRespuesta ?? falta }}</dd>
                  @if (webpay.estado === 'RECHAZADA') {
                    <dt class="text-muted-foreground">Motivo del rechazo</dt>
                    <dd>{{ webpay.motivoRechazo ?? falta }}</dd>
                  }
                  <dt class="text-muted-foreground">Iniciado</dt>
                  <dd>{{ cuando(webpay.creadaEn) }}</dd>
                  <!-- No «Confirmado»: un rechazo también tiene respuesta. -->
                  <dt class="text-muted-foreground">Respuesta de Webpay</dt>
                  <dd>{{ webpay.confirmadaEn ? cuando(webpay.confirmadaEn) : '—' }}</dd>
                </dl>
              </section>

              @if (webpay.estado === 'ANULADA') {
                <section data-devolucion class="mt-4" aria-labelledby="titulo-devolucion">
                  <h3
                    id="titulo-devolucion"
                    class="font-display text-sm font-bold tracking-wide uppercase"
                  >
                    Devolución
                  </h3>
                  <!-- Como la revisión: quién, cuándo y el texto que se pidió. -->
                  <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt class="text-muted-foreground">Devuelto por</dt>
                    <dd>{{ devueltoPor(webpay) }}</dd>
                    <dt class="text-muted-foreground">Cuándo</dt>
                    <dd>{{ webpay.anuladaEn ? cuando(webpay.anuladaEn) : 'No se guardó' }}</dd>
                    @if (webpay.motivoAnulacion) {
                      <dt class="text-muted-foreground">Motivo</dt>
                      <dd>{{ webpay.motivoAnulacion }}</dd>
                    }
                  </dl>
                </section>
              }

              @if (webpay.requiereRevision) {
                <section data-revision class="mt-4" aria-labelledby="titulo-revision">
                  <h3
                    id="titulo-revision"
                    class="font-display text-sm font-bold tracking-wide uppercase"
                  >
                    Revisión
                  </h3>
                  @if (webpay.revisadaEn) {
                    <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      <dt class="text-muted-foreground">Revisado por</dt>
                      <!-- Con fecha hubo alguien: sin nombre, se borró su cuenta (FK en null). -->
                      <dd>{{ webpay.revisadaPorNombre ?? 'Cuenta eliminada' }}</dd>
                      <dt class="text-muted-foreground">Cuándo</dt>
                      <dd>{{ cuando(webpay.revisadaEn) }}</dd>
                      <dt class="text-muted-foreground">Nota</dt>
                      <dd>{{ webpay.notaRevision }}</dd>
                    </dl>
                  } @else {
                    <p class="mt-1 text-sm">
                      <span class="font-semibold">Por revisar:</span> algo no cuadró con este pago.
                      Compáralo con el portal de Transbank y, cuando lo resuelvas, márcalo como
                      revisado.
                    </p>
                  }
                </section>
              }
            }

            @if (sinDevolucion(); as porQue) {
              <!-- Qué hacer primero, con el enlace al lugar donde se hace (F8). -->
              <app-aviso data-sin-devolucion variante="info" class="mt-4 block">
                {{ porQue.motivo }}
                @if (porQue.enlace) {
                  <a class="underline" [routerLink]="porQue.enlace">{{ porQue.irA }}</a>
                }
              </app-aviso>
            }
          </mat-dialog-content>

          @if (puedeDevolver() || porRevisar()) {
            <mat-dialog-actions align="end">
              @if (puedeDevolver()) {
                <button #devolver matButton type="button" (click)="preguntar('devolver')">
                  Devolver
                </button>
              }
              @if (porRevisar()) {
                <!-- La otra acción llena es confirmar, en la otra rama del mismo if: se ve una a
                     la vez.
                     mat-guidelines-ignore: multiples-filled -->
                <button #revisar matButton="filled" type="button" (click)="preguntar('revisar')">
                  Marcar como revisado
                </button>
              }
            </mat-dialog-actions>
          }
        }
      } @else if (ficha.error()) {
        <mat-dialog-content>
          <p class="text-destructive">No se pudo cargar el pago. Reintenta en un momento.</p>
        </mat-dialog-content>
      } @else {
        <mat-dialog-content>
          <app-esqueleto [filas]="4" etiqueta="Buscando el pago…" />
        </mat-dialog-content>
      }
    </ng-template>
  `,
})
export class FichaDelPago {
  readonly origen = input.required<OrigenDelPago>();
  readonly id = input.required<number>();

  /** Se cerró: con Escape, el fondo o el ícono. */
  readonly cerrar = output<void>();
  /** Se devolvió o se revisó: la lista y el resumen se vuelven a pedir. */
  readonly cambio = output<void>();

  private readonly api = inject(PagosDelClub);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly injector = inject(Injector);

  private readonly dialogo = viewChild.required<TemplateRef<unknown>>('dialogo');
  private readonly campo = viewChild('campo', { read: ElementRef<HTMLTextAreaElement> });
  private readonly cerrarFicha = viewChild('cerrarFicha', { read: ElementRef<HTMLButtonElement> });
  private readonly botonDevolver = viewChild('devolver', { read: ElementRef<HTMLButtonElement> });
  private readonly botonRevisar = viewChild('revisar', { read: ElementRef<HTMLButtonElement> });

  protected readonly ficha = resource({
    params: () => ({ origen: this.origen(), id: this.id() }),
    loader: ({ params }) => this.api.ficha(params.origen, params.id),
  });

  /** La acción que se está confirmando, o null en la ficha. */
  protected readonly accion = signal<Accion | null>(null);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly texto = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(LARGO_MAXIMO)],
  });

  private readonly webpay = computed(() => (this.ficha.hasValue() ? this.ficha.value().webpay : null));

  /** La API ya dijo si se puede: la ficha no lo vuelve a calcular. */
  protected readonly puedeDevolver = computed(
    () => this.ficha.hasValue() && this.ficha.value().devolucion?.permitida === true,
  );
  protected readonly porRevisar = computed(() => {
    const webpay = this.webpay();
    return !!webpay?.requiereRevision && !webpay.revisadaEn;
  });

  /**
   * Por qué no se puede devolver un pago autorizado: sigue vigente lo pagado o pasó el plazo. En
   * los demás estados no se dice nada; el estado ya lo explica.
   */
  protected readonly sinDevolucion = computed(() => {
    if (!this.ficha.hasValue()) return null;
    const { fila, devolucion, asociadoA } = this.ficha.value();
    if (fila.estado !== 'AUTORIZADA' || !devolucion || devolucion.permitida || !devolucion.motivo) {
      return null;
    }
    return {
      motivo: devolucion.motivo,
      enlace: this.urlDe(devolucion.enlace),
      irA: IR_A[asociadoA.tipo],
    };
  });

  protected readonly enlaceAlAsociado = computed(() =>
    this.ficha.hasValue() ? this.urlDe(this.ficha.value().asociadoA.enlace) : null,
  );

  protected readonly titulo = computed(() => {
    if (!this.ficha.hasValue()) return 'Pago';
    const { fila, webpay } = this.ficha.value();
    switch (this.accion()) {
      case 'devolver':
        return webpay?.ultimosDigitos
          ? `¿Devolver ${enPesos(fila.montoClp)} a la tarjeta terminada en ${webpay.ultimosDigitos}?`
          : `¿Devolver ${enPesos(fila.montoClp)} a la tarjeta con la que se pagó?`;
      case 'revisar':
        // El nombre y no la orden de compra: el título va en mayúsculas, y la orden no se leería
        // igual que en la cartola.
        return `¿Marcar como revisado el pago de ${fila.quien}?`;
      default:
        // «—» es lo pagado que ya no existe: «Pago de —» no dice nada.
        return fila.quien === '—' ? 'Pago' : `Pago de ${fila.quien}`;
    }
  });

  constructor() {
    dialogoSegun(
      () => true,
      this.dialogo,
      () => this.cerrar.emit(),
      { width: '36rem', maxWidth: '92vw' },
    );
  }

  /** Pasa a la confirmación; el foco va al campo, que es lo que falta llenar. */
  protected preguntar(accion: Accion): void {
    this.texto.reset();
    this.error.set(null);
    this.accion.set(accion);
    this.enfocar(() => this.campo());
  }

  /** De vuelta a la ficha, el foco vuelve al botón que abrió la confirmación. */
  protected volverALaFicha(): void {
    const desde = this.accion();
    this.error.set(null);
    this.accion.set(null);
    this.enfocar(() => (desde === 'devolver' ? this.botonDevolver() : this.botonRevisar()));
  }

  protected async confirmar(accion: Accion): Promise<void> {
    if (this.enviando() || !this.ficha.hasValue()) return;
    if (this.texto.invalid) {
      this.texto.markAsTouched();
      this.campo()?.nativeElement.focus();
      return;
    }

    const id = this.ficha.value().fila.id;
    const texto = this.texto.value.trim();
    this.enviando.set(true);
    this.error.set(null);
    try {
      const fresca =
        accion === 'devolver' ? await this.api.devolver(id, texto) : await this.api.revisar(id, texto);
      this.ficha.set(fresca);
      this.accion.set(null);
      this.snackBar.open(ACCIONES[accion].hecho, undefined, LO_HECHO);
      this.cambio.emit();
      // El botón que la abrió ya no está: el foco va al ícono de cerrar, que siempre está.
      this.enfocar(() => this.cerrarFicha());
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, ACCIONES[accion].fallo));
      // Otra persona ya lo hizo: la ficha se pone al día detrás de la confirmación, y «Volver»
      // muestra quién. La lista también (revisión, T400).
      if (falla instanceof HttpErrorResponse && falla.status === 409) {
        this.ficha.reload();
        this.cambio.emit();
      }
    } finally {
      this.enviando.set(false);
    }
  }

  private enfocar(cual: () => ElementRef<HTMLElement> | undefined): void {
    afterNextRender(() => cual()?.nativeElement.focus(), { injector: this.injector });
  }

  /** El enlace de la API, como lo entiende `routerLink`: con su consulta y no como texto. */
  private urlDe(enlace: string | null): UrlTree | null {
    return enlace ? this.router.parseUrl(enlace) : null;
  }

  /** «Sin cuotas» en vez de «0»; nulo si no se guardó. */
  protected cuotasDe({ numeroCuotas }: PagoWebpay): string | null {
    if (numeroCuotas === null) return null;
    return numeroCuotas === 0 ? 'Sin cuotas' : String(numeroCuotas);
  }

  /**
   * Quién devolvió. Sin persona: si hay motivo fue a mano y se borró su cuenta (la FK queda en
   * null); si no, la hizo el sistema al cancelar, cerrar una cancha o no aplicar un cambio. Sin
   * fecha es anterior a T395, y no se sabe.
   */
  protected devueltoPor(webpay: PagoWebpay): string {
    if (webpay.anuladaPorNombre) return webpay.anuladaPorNombre;
    if (webpay.motivoAnulacion) return 'Cuenta eliminada';
    return webpay.anuladaEn ? 'El sistema, al cancelar o cambiar la reserva' : 'No se guardó';
  }

  /** «Débito»: la palabra del tipo, con mayúscula porque va sola. */
  protected tipoDePago({ tipoPago }: PagoWebpay): string | null {
    if (!tipoPago) return null;
    const palabra = TIPO_DE_PAGO[tipoPago] ?? tipoPago;
    return palabra.charAt(0).toUpperCase() + palabra.slice(1);
  }

  /** «lunes, 10 de agosto, 11:00», en la hora del club. */
  protected cuando(instante: string): string {
    return `${diaEnPalabras(fechaEnElClub(instante))}, ${horaEnElClub(instante)}`;
  }

  protected readonly acciones = ACCIONES;
  protected readonly estados = ESTADO_DEL_PAGO;
  protected readonly LARGO_MAXIMO = LARGO_MAXIMO;
  protected readonly fechaYHora = fechaYHoraDelClub;
  protected readonly medio = medioDelPago;
  protected readonly pesos = enPesos;
}
