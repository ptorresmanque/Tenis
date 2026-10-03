import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { enPesos } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Insignia, VarianteInsignia } from '../../ui/insignia';
import { InscripcionTorneo, Torneos } from '../torneos.service';

/**
 * Quién juega un torneo.
 *
 * **Pasado el cupo, el jugador entra en lista de espera y no se lo rechaza.** El club
 * llama por teléfono antes de meter a alguien en un cuadro que ya anunció, así que
 * promover es un botón y no un automatismo: quien quedó fuera hace dos semanas ya hizo
 * otros planes.
 */
@Component({
  selector: 'app-inscritos-torneo',
  imports: [FormsModule, Aviso, Insignia],
  template: `
    @if (lista.value(); as datos) {
      <div class="mt-3 rounded-xl border border-border bg-background p-4">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="rotulo-seccion">Inscritos</h2>
          <app-insignia
            [variante]="datos.inscritos.length >= datos.cupo ? 'aviso' : 'neutro'"
            icono="group"
          >
            {{ datos.inscritos.length }} de {{ datos.cupo }}
          </app-insignia>
          @if (datos.montoClp > 0) {
            <span class="text-sm text-muted-foreground">
              inscripción {{ pesos(datos.montoClp) }}
            </span>
          }
        </div>

        <!-- **El filtro es la lista de trabajo del club.** "Por revisar" no es un
             estado de la base: es toda pendiente que no se resuelve sola, y la única
             que se resuelve sola es la que eligió Webpay y no pagó. -->
        @if (porRevisar(datos.inscritos).length > 0 || filtro() !== 'todos') {
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              class="boton boton-chico"
              [class]="filtro() === 'todos' ? 'boton-primario' : 'boton-secundario'"
              [attr.aria-pressed]="filtro() === 'todos'"
              (click)="filtro.set('todos')"
            >
              Todos {{ datos.inscritos.length }}
            </button>
            <button
              type="button"
              class="boton boton-chico"
              [class]="filtro() === 'revisar' ? 'boton-primario' : 'boton-secundario'"
              [attr.aria-pressed]="filtro() === 'revisar'"
              (click)="filtro.set('revisar')"
            >
              Por revisar {{ porRevisar(datos.inscritos).length }}
            </button>
          </div>
        }

        @if (error(); as falla) {
          <app-aviso variante="error" class="mt-2 block">{{ falla }}</app-aviso>
        }

        @if (datos.inscritos.length === 0) {
          <p class="mt-2 text-sm text-muted-foreground">Todavía no hay nadie inscrito.</p>
        } @else {
          <div
            class="mt-2 hidden gap-x-3 px-1 text-xs text-muted-foreground
                   sm:grid sm:grid-cols-[minmax(0,1fr)_10rem_5rem_11rem]"
          >
            <span>Jugador</span>
            <span>Pago</span>
            <span>Siembra</span>
            <span></span>
          </div>
          <ul class="mt-1 grid gap-2">
            @for (quien of visibles(datos.inscritos); track quien.id) {
              <li class="grid gap-1 text-sm">
                <!-- **Cuatro columnas alineadas y no un renglón de piezas sueltas.**
                     Con todo en un solo renglón, el estado de pago y el de revisar
                     caían en un lugar distinto en cada fila —según el largo del
                     nombre y si había procedencia— y no se podían comparar de un
                     vistazo, que es justo para lo que sirve una lista de inscritos. -->
                <div
                  class="grid items-center gap-x-3 gap-y-1
                         sm:grid-cols-[minmax(0,1fr)_10rem_5rem_11rem]"
                >
                  <div class="min-w-0">
                    <span class="font-medium">{{ quien.jugador }}</span>
                    @if (quien.numeroSocio) {
                      <app-insignia variante="info" icono="badge" class="ms-2">
                        Socio {{ quien.numeroSocio }}
                      </app-insignia>
                    } @else if (quien.procedencia) {
                      <span class="ms-2 text-muted-foreground">
                        {{ quien.procedencia }}
                      </span>
                    }
                  </div>

                  <app-insignia
                    class="justify-self-start"
                    [variante]="pago(quien).variante"
                    [icono]="pago(quien).icono"
                  >
                    {{ pago(quien).texto }}
                  </app-insignia>

                  <label class="flex items-center gap-1">
                    <span class="sr-only">Siembra de {{ quien.jugador }}</span>
                    <input
                      class="campo campo-chico w-16"
                      type="number"
                      min="1"
                      placeholder="—"
                      [name]="'siembra-' + quien.id"
                      [value]="quien.siembra ?? ''"
                      [disabled]="trabajando() || datos.estado !== 'INSCRIPCION'"
                      (change)="sembrar(quien, $any($event.target).value)"
                    />
                  </label>

                  <!-- Las acciones juntas y al final, siempre en el mismo sitio. -->
                  <div class="flex items-center gap-1 justify-self-end">
                    <!-- **Para cualquier pendiente, con comprobante o sin él.** Al
                         que anota el admin —el que llega al mesón y paga ahí— también
                         hay que poder cobrarle, y atar el botón al comprobante lo
                         dejaba sin ninguna salida. -->
                    @if (quien.estadoPago === 'PENDIENTE') {
                      <button
                        type="button"
                        class="boton boton-secundario boton-chico"
                        [attr.aria-expanded]="revisando() === quien.id"
                        (click)="alternarRevision(quien.id)"
                      >
                        @if (revisando() === quien.id) {
                          Cerrar
                        } @else {
                          {{ quien.tieneComprobante ? 'Revisar' : 'Resolver' }}
                        }
                      </button>
                    }
                    <button
                      type="button"
                      class="boton boton-texto boton-chico"
                      [disabled]="trabajando()"
                      (click)="retirar(quien)"
                    >
                      Retirar
                    </button>
                  </div>
                </div>

                <!-- **Cuándo NO puede jugar** (T65). Va acá y no en lo público: dice a
                     qué hora esa persona no está en su casa. Es lo que el club mira al
                     programar los partidos, así que se lee de un vistazo. -->
                @if (quien.restricciones.length > 0) {
                  <p class="text-xs text-muted-foreground">
                    <span class="icono align-middle text-sm" aria-hidden="true">
                      schedule
                    </span>
                    No puede
                    {{ enPalabras(quien.restricciones) }}
                  </p>
                }

                <!-- **El comprobante se mira acá y la decisión se toma acá.** La
                     imagen se pide recién al abrir esta fila: con la de cada inscrito
                     cargada de entrada, abrir un cuadro lleno se traía veinte fotos. -->
                @if (revisando() === quien.id) {
                  <div
                    class="mt-1 grid gap-3 rounded-lg border border-border bg-card p-3
                           sm:grid-cols-[12rem_1fr]"
                  >
                    @if (quien.tieneComprobante) {
                      <a
                        [href]="'/api/admin/inscripciones/' + quien.id + '/comprobante'"
                        target="_blank"
                        rel="noopener"
                      >
                        <img
                          class="max-h-40 w-full rounded-lg border border-border object-contain"
                          [src]="'/api/admin/inscripciones/' + quien.id + '/comprobante'"
                          alt="Comprobante de {{ quien.jugador }}. Ábrelo para verlo en grande."
                        />
                      </a>
                    } @else {
                      <!-- El que pagó en el mesón, o el que mandó su transferencia por
                           WhatsApp: el club puede adjuntarla acá como respaldo. -->
                      <div
                        class="grid content-center gap-2 rounded-lg border border-dashed
                               border-border p-3 text-center"
                      >
                        <p class="text-xs text-muted-foreground">
                          No adjuntó comprobante.
                        </p>
                        <label class="boton boton-secundario boton-chico cursor-pointer">
                          Adjuntar uno
                          <input
                            class="sr-only"
                            type="file"
                            accept="image/jpeg,image/png"
                            [attr.name]="'comprobante-' + quien.id"
                            [disabled]="trabajando()"
                            (change)="adjuntar(quien, $event)"
                          />
                        </label>
                      </div>
                    }

                    <div>
                      <p class="text-sm text-muted-foreground">
                        <!-- El medio **si se sabe**. Decía "Transferencia" siempre, y
                             al que anotó el admin —el del mesón— le mentía. -->
                        @if (quien.medioPago) {
                          {{ nombreDelMedio(quien.medioPago) }} ·
                        }
                        {{ pesos(datos.montoClp) }}
                        @if (quien.telefono) {
                          <br />Para llamarlo: {{ quien.telefono }}
                        }
                      </p>

                      <!-- **Las dos decisiones, juntas.** Venían separadas por el
                           campo del motivo, heredado de la bandeja vieja: con un
                           campo elástico de por medio, rechazar quedaba en la otra
                           punta de la fila y no se leía como la pareja de confirmar. -->
                      <label class="mt-2 block text-sm">
                        <span class="text-muted-foreground">Cómo pagó</span>
                        <select
                          class="campo campo-chico mt-1"
                          [attr.name]="'medio-' + quien.id"
                          [(ngModel)]="medios[quien.id]"
                        >
                          <option value="">Sin especificar</option>
                          @for (medio of MEDIOS; track medio.valor) {
                            <option [value]="medio.valor">{{ medio.opcion }}</option>
                          }
                        </select>
                      </label>

                      <label class="mt-2 block text-sm">
                        <span class="text-muted-foreground">Motivo del rechazo</span>
                        <input
                          class="campo campo-chico mt-1"
                          [attr.name]="'motivo-' + quien.id"
                          maxlength="200"
                          placeholder="El comprobante es de otro monto"
                          [(ngModel)]="motivos[quien.id]"
                        />
                      </label>

                      <!-- Los dos abren el modal; la decisión se toma allá. -->
                      <div class="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            class="boton boton-primario boton-chico"
                            [disabled]="trabajando()"
                            (click)="preguntar(quien, 'aprobar')"
                          >
                            Confirmar el pago
                          </button>

                          <button
                            type="button"
                            class="boton boton-secundario boton-chico"
                            [disabled]="trabajando()"
                            (click)="preguntar(quien, 'rechazar')"
                          >
                            Rechazar
                          </button>
                        </div>

                        <p class="mt-2 text-xs text-muted-foreground">
                          Rechazar libera el cupo: pasa al primero de la lista de espera.
                        </p>
                    </div>
                  </div>
                }
              </li>
            }
          </ul>
        }

        @if (datos.enEspera.length > 0) {
          <h3 class="mt-3 font-medium">
            Lista de espera
            <span class="text-sm font-normal text-muted-foreground">
              · en orden de llegada
            </span>
          </h3>
          <ul class="mt-1 grid gap-2">
            @for (quien of datos.enEspera; track quien.id) {
              <li class="flex flex-wrap items-center gap-2 text-sm">
                <span>{{ quien.jugador }}</span>
                <button
                  type="button"
                  class="boton boton-secundario boton-chico ms-auto"
                  [disabled]="trabajando()"
                  (click)="promover(quien)"
                >
                  Meter al cuadro
                </button>
              </li>
            }
          </ul>
          <p class="mt-1 text-sm text-muted-foreground">
            No entran solos: el club llama antes de meter a alguien en el cuadro.
          </p>
        }

        @if (datos.retirados.length > 0) {
          <p class="mt-3 text-sm text-muted-foreground">
            Se bajaron: {{ nombresRetirados() }}
          </p>
        }

        @if (datos.estado === 'INSCRIPCION') {
          <form class="mt-3 border-t border-border pt-3" (ngSubmit)="inscribir()">
            <div class="flex flex-wrap items-end gap-2">
              <label class="min-w-64 flex-1">
                <span class="text-sm font-medium">Inscribir a</span>
                <select
                  class="campo campo-chico mt-1"
                  name="jugadorId"
                  [(ngModel)]="jugadorId"
                >
                  <option [value]="0" disabled>Elige un jugador</option>
                  @for (jugador of porInscribir(); track jugador.id) {
                    <option [value]="jugador.id">
                      {{ jugador.apellido }}, {{ jugador.nombre }}
                    </option>
                  }
                </select>
              </label>

              <button
                type="submit"
                class="boton boton-secundario boton-chico"
                [disabled]="trabajando()"
              >
                Inscribir
              </button>
            </div>

            @if (datos.inscritos.length >= datos.cupo) {
              <p class="mt-2 text-sm text-muted-foreground">
                El cuadro está lleno: el que se inscriba queda en lista de espera.
              </p>
            }
          </form>
        } @else {
          <p class="mt-3 text-sm text-muted-foreground">
            La inscripción de este torneo está cerrada.
          </p>
        }
      </div>
    }

    <!-- **La confirmación es un modal de verdad**, no una tira más dentro de la fila.
         Se abre con showModal y no con el atributo open: es lo único que vuelve inerte
         el resto de la página y atrapa el foco, que es lo que hace que una pregunta se
         lea como una pregunta. Mismo patrón que la ficha del socio y la reserva. -->
    <dialog
      #confirmacion
      closedby="any"
      class="m-auto w-[min(28rem,92vw)] rounded-2xl bg-card p-6 shadow-xl
             backdrop:bg-foreground/50"
      aria-labelledby="titulo-confirmacion"
      (close)="confirmando.set(null)"
    >
      @if (confirmando(); as decision) {
        <h2 id="titulo-confirmacion" class="titular text-2xl">
          {{ decision.accion === 'aprobar' ? 'Confirmar el pago' : 'Rechazar el pago' }}
        </h2>

        <p class="mt-2 max-w-prose text-sm text-muted-foreground">
          @if (decision.accion === 'aprobar') {
            {{ decision.quien.jugador }} queda pagado
            @if (medios[decision.quien.id]) {
              {{ comoPago(medios[decision.quien.id]) }}
            }
            . Esto no se deshace desde acá.
          } @else {
            Rechazar el pago de {{ decision.quien.jugador }}
            <strong>libera el cupo</strong>: pasa al primero de la lista de espera, y
            su inscripción queda retirada.
          }
        </p>

        <div class="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            class="boton boton-texto"
            (click)="confirmacion.close()"
          >
            Mejor no
          </button>
          <button
            type="button"
            class="boton boton-primario"
            [disabled]="trabajando()"
            (click)="resolver(decision.quien)"
          >
            {{
              decision.accion === 'aprobar'
                ? 'Sí, confirmar el pago'
                : 'Sí, rechazar'
            }}
          </button>
        </div>
      }
    </dialog>
  `,
})
export class InscritosDelTorneo {
  private readonly api = inject(Torneos);

  /** El id del **cuadro**: el cupo y la lista de espera son suyos, no del torneo. */
  readonly cuadroId = input.required<number>();

  protected jugadorId = 0;

  /**
   * Las franjas en palabras: "los martes de 18:00 a 21:00 y los jueves de 09:00 a 12:00".
   *
   * En una línea y no en una lista: el admin las lee al pasar, mientras decide a qué
   * hora poner un partido, y una lista por inscrito llenaría la pantalla de viñetas.
   */
  protected enPalabras(
    franjas: { diaSemana: number; horaDesde: string; horaHasta: string }[],
  ): string {
    return franjas
      .map(
        (franja) =>
          `los ${DIAS[franja.diaSemana]} de ${franja.horaDesde} a ${franja.horaHasta}`,
      )
      .join(' y ');
  }

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Qué se está mirando: todos, o solo lo que espera una decisión. */
  protected readonly filtro = signal<'todos' | 'revisar'>('todos');

  /** Qué fila tiene el comprobante abierto. Una a la vez: la imagen pesa. */
  protected readonly revisando = signal<number | null>(null);

  /** El motivo del rechazo, por inscripción. */
  protected motivos: Record<number, string> = {};

  /** Cómo dice el club que se pagó, por inscripción. */
  protected medios: Record<number, string> = {};

  /**
   * Los tres medios, como se llaman en pantalla.
   *
   * `EFECTIVO` es el que da sentido a todo esto: el que llega al mesón, se anota y
   * paga ahí. Los otros dos existen para corregir el que la persona declaró mal.
   */
  /**
   * Los tres medios y sus tres formas de nombrarse.
   *
   * **Una sola tabla.** Estuvieron repartidos en tres —la del selector, la de la línea
   * del panel y la de la frase del modal— y agregar un medio obligaba a acordarse de
   * las tres. `EFECTIVO` es el que da sentido a todo esto: el que llega al mesón, se
   * anota y paga ahí.
   */
  protected readonly MEDIOS = [
    {
      valor: 'EFECTIVO',
      opcion: 'En efectivo, en el club',
      corto: 'Efectivo',
      enFrase: 'en efectivo',
    },
    {
      valor: 'TRANSFERENCIA',
      opcion: 'Por transferencia',
      corto: 'Transferencia',
      enFrase: 'por transferencia',
    },
    { valor: 'WEBPAY', opcion: 'Con Webpay', corto: 'Webpay', enFrase: 'con Webpay' },
  ];

  /** "en efectivo", para la frase del modal. Vacío si no se eligió ninguno. */
  protected comoPago(medio: string): string {
    return this.MEDIOS.find((uno) => uno.valor === medio)?.enFrase ?? '';
  }

  /** "Efectivo", para la línea corta del panel. */
  protected nombreDelMedio(medio: string): string {
    return this.MEDIOS.find((uno) => uno.valor === medio)?.corto ?? '';
  }

  protected readonly pesos = enPesos;

  /**
   * Cómo se lee el pago de un inscrito.
   *
   * **`PENDIENTE` se muestra como dos cosas distintas**, y esa es la decisión que hace
   * útil la columna: con comprobante es trabajo del club —alguien tiene que mirar una
   * imagen y decidir—; sin él es alguien que eligió Webpay y no pagó, que se resuelve
   * solo cuando el barrido le suelta el cupo. Mostrarlas iguales las volvería ruido.
   */
  protected pago(quien: InscripcionTorneo): {
    texto: string;
    variante: VarianteInsignia;
    icono: string;
  } {
    if (quien.estadoPago === 'PAGADA') {
      return { texto: 'Pagada', variante: 'exito', icono: 'check_circle' };
    }

    if (quien.estadoPago === 'EXENTA') {
      return { texto: 'Exenta', variante: 'neutro', icono: 'money_off' };
    }

    if (quien.estadoPago === 'RECHAZADA') {
      return { texto: 'Rechazada', variante: 'error', icono: 'cancel' };
    }

    if (quien.tieneComprobante) {
      return { texto: 'Por revisar', variante: 'aviso', icono: 'receipt_long' };
    }

    return {
      texto:
        quien.medioPago === 'WEBPAY' ? 'Webpay sin pagar' : 'Sin pagar',
      variante: 'neutro',
      icono: 'schedule',
    };
  }

  /**
   * Los que esperan que una persona decida.
   *
   * **Toda pendiente que no se resuelve sola**, y solo se resuelve sola una: la que
   * eligió Webpay y no pagó, que el barrido suelta a los quince minutos. El que trae
   * comprobante espera que lo miren; el que anotó el admin espera que le cobren. Contar
   * solo a los primeros dejaba al del mesón invisible en la lista de trabajo.
   */
  protected porRevisar(inscritos: InscripcionTorneo[]): InscripcionTorneo[] {
    return inscritos.filter(
      (quien) =>
        quien.estadoPago === 'PENDIENTE' &&
        !(quien.medioPago === 'WEBPAY' && !quien.tieneComprobante),
    );
  }

  protected visibles(inscritos: InscripcionTorneo[]): InscripcionTorneo[] {
    return this.filtro() === 'revisar'
      ? this.porRevisar(inscritos)
      : inscritos;
  }

  protected alternarRevision(id: number): void {
    this.revisando.update((actual) => (actual === id ? null : id));
  }

  /**
   * Qué inscripción está esperando un "sí", y para qué.
   *
   * Las dos decisiones son de las que no se deshacen solas: confirmar da por cobrada
   * plata que puede no haber llegado, y rechazar suelta el cupo y se lo ofrece a otro.
   */
  protected readonly confirmando = signal<{
    quien: InscripcionTorneo;
    accion: 'aprobar' | 'rechazar';
  } | null>(null);

  private readonly confirmacion =
    viewChild.required<ElementRef<HTMLDialogElement>>('confirmacion');

  constructor() {
    // Abrir y cerrar el `<dialog>` sigue a la señal, en vez de que cada botón lo haga
    // a mano: así el `closedby="any"` —la tecla Esc y el clic en el fondo— y el botón
    // de "mejor no" terminan todos en el mismo estado.
    effect(() => {
      const abierto = this.confirmando() !== null;
      const elemento = this.confirmacion().nativeElement;

      if (abierto && !elemento.open) elemento.showModal();
      if (!abierto && elemento.open) elemento.close();
    });
  }

  /**
   * Primer clic: pregunta.
   *
   * **El motivo se valida antes de preguntar.** Al revés sería pedir que confirmen
   * algo que el propio formulario va a rechazar dos pasos después.
   */
  protected preguntar(
    quien: InscripcionTorneo,
    accion: 'aprobar' | 'rechazar',
  ): void {
    this.error.set(null);

    if (accion === 'rechazar' && (this.motivos[quien.id] ?? '').trim() === '') {
      this.error.set(
        'Escribe el motivo del rechazo: es lo que se le va a decir.',
      );
      return;
    }

    this.confirmando.set({ quien, accion });
  }

  /** Segundo clic: la decisión, y el panel se cierra con ella. */
  protected async resolver(quien: InscripcionTorneo): Promise<void> {
    const accion = this.confirmando()?.accion;

    await this.intentar(async () => {
      if (accion === 'aprobar') {
        // El medio va solo si el club lo dijo: vacío significa "no lo sé", y mandar
        // uno por omisión escribiría en la caja un dato que nadie eligió.
        await this.api.aprobarPago(
          quien.id,
          this.medios[quien.id] || undefined,
        );
      } else {
        await this.api.rechazarPago(
          quien.id,
          (this.motivos[quien.id] ?? '').trim(),
        );
        this.motivos = { ...this.motivos, [quien.id]: '' };
      }

      // **Se cierra al resolver.** Con el panel abierto sobre una inscripción ya
      // resuelta, el segundo clic recibía "esa inscripción ya no está pendiente" y
      // parecía un error del sistema en vez de un botón que sobraba.
      this.confirmando.set(null);
      this.revisando.set(null);
    });
  }

  /**
   * Adjunta el comprobante por el jugador.
   *
   * Es el que mandó su transferencia por WhatsApp: el club la guarda como respaldo de
   * lo que está por aprobar. Desde la pantalla pública se sube con el token de la
   * inscripción, que el panel no tiene.
   */
  protected async adjuntar(
    quien: InscripcionTorneo,
    evento: Event,
  ): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];

    if (!archivo) return;

    await this.intentar(() =>
      this.api.subirComprobanteDelClub(quien.id, archivo),
    );
  }


  private readonly version = signal(0);

  protected readonly lista = resource({
    params: () => ({ id: this.cuadroId(), version: this.version() }),
    loader: ({ params }) => this.api.inscripciones(params.id),
  });

  protected readonly jugadores = resource({
    loader: () => this.api.jugadores(true),
    defaultValue: [],
  });

  /**
   * Los que todavía no están en este torneo.
   *
   * Elegir a alguien que ya está responde 409 con un mensaje claro, pero la lista lo
   * seguiría ofreciendo. El que se retiró vuelve a aparecer: puede reinscribirse.
   */
  protected readonly porInscribir = computed(() => {
    const yaEstan = new Set(
      [
        ...(this.lista.value()?.inscritos ?? []),
        ...(this.lista.value()?.enEspera ?? []),
      ].map((quien) => quien.jugadorId),
    );

    return this.jugadores.value().filter((jugador) => !yaEstan.has(jugador.id));
  });

  protected readonly nombresRetirados = computed(() =>
    (this.lista.value()?.retirados ?? [])
      .map((quien) => quien.jugador)
      .join(', '),
  );

  protected async inscribir(): Promise<void> {
    await this.intentar(async () => {
      await this.api.inscribir(this.cuadroId(), {
        jugadorId: Number(this.jugadorId),
      });
      this.jugadorId = 0;
    });
  }

  /**
   * Pone o quita la siembra.
   *
   * **La decide el admin, no el ranking**: es lo que hace hoy y lo que le permite
   * separar a dos socios que ya jugaron la final el mes pasado.
   */
  protected async sembrar(quien: InscripcionTorneo, valor: string): Promise<void> {
    await this.intentar(() =>
      this.api.sembrar(
        this.cuadroId(),
        quien.id,
        valor === '' ? null : Number(valor),
      ),
    );
  }

  protected async retirar(quien: InscripcionTorneo): Promise<void> {
    await this.intentar(() => this.api.retirar(this.cuadroId(), quien.id));
  }

  protected async promover(quien: InscripcionTorneo): Promise<void> {
    await this.intentar(() => this.api.promover(this.cuadroId(), quien.id));
  }

  private async intentar(accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si la inscripción se cerró, si el cuadro está lleno o
      // si ese jugador ya está.
      this.error.set(mensajeDelServidor(falla, 'No se pudo inscribir.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}

/** 0 = domingo, con la convención de `HorarioApertura`. Solo se usan 1 a 5. */
const DIAS = [
  'domingos',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábados',
];
