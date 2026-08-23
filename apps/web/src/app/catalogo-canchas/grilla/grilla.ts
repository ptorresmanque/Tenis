import { Component, computed, inject, resource, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { Auth } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { ReportesDelSocio } from '../../reservas/reportes.service';
import { mensajeDeRechazo, Reservas } from '../../reservas/reservas.service';
import { Reservar } from '../../reservas/reservar';
import { BarraFija } from '../../ui/barra-fija';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { Selector } from '../../ui/selector';
import { BloqueDisponible, Cancha, Disponibilidad } from '../disponibilidad';
import {
  diaEnPalabras,
  enPesos,
  hoyEnElClub,
  horaEnElClub,
  proximosDias,
} from '../reloj-del-club';

/**
 * Cómo se nombra cada motivo de bloqueo. El enum de la base no se muestra crudo:
 * "MANTENCION" en pantalla se lee como un error del sistema.
 */
const MOTIVOS: Record<string, string> = {
  MANTENCION: 'En mantención',
  TORNEO: 'Torneo',
  CLASE: 'Clase',
  OTRO: 'No disponible',
};

const SUPERFICIES: Record<string, string> = {
  ARCILLA: 'Arcilla',
  CEMENTO: 'Cemento',
  PASTO_SINTETICO: 'Pasto sintético',
};

/**
 * Lo que el bloque dice de la tarifa del socio: nada de plata, porque no paga la
 * hora sino su cuota mensual.
 *
 * En un solo lugar porque aparece en el bloque, en la etiqueta accesible y en la
 * barra de abajo: el día que el club cobre la hora pico al socio, un "sin costo"
 * suelto habría quedado en dos de los tres y nadie lo notaría hasta que reclamen.
 *
 * No viene del servidor a propósito. `BloqueDisponible.montoClp` es la tarifa del
 * no-socio, y el contrato de `catalogo-canchas` no tiene ni tiene por qué tener un
 * precio por tipo de persona.
 */
const TARIFA_DEL_SOCIO = 'sin costo';

@Component({
  selector: 'app-grilla',
  imports: [Reservar, BarraFija, EstadoVacio, Insignia, Selector],
  host: {
    class: 'block',
    // La barra fija tapa la última fila de bloques si no se le deja aire, y el
    // checklist del master lo prohíbe.
    '[class.pb-28]': 'elegido() !== null',
  },
  template: `
    <h1 class="font-display text-3xl font-bold">Disponibilidad</h1>

    @if (moviendo() !== null) {
      <!-- Se dice arriba y no en cada bloque: quien llega desde "mis reservas" tiene
           que saber que el proximo clic mueve su hora en vez de tomar una nueva. -->
      <p class="mt-3 rounded-lg bg-muted p-3 font-medium">
        Elige la nueva hora para tu reserva. La que tenías queda liberada.
      </p>
    }

    @if (avisoDeReporte(); as aviso) {
      <p role="status" class="mt-3 rounded-lg bg-muted p-3 text-sm font-medium">
        {{ aviso }}
      </p>
    }

    @if (errorAlMover(); as falla) {
      <p role="alert" class="mt-3 rounded-lg bg-destructive/10 p-3 text-destructive">
        {{ falla }}
      </p>
    }

    <div class="mt-4 flex flex-wrap items-end gap-4">
      <!-- La semana a un toque. El calendario sigue estando al lado para ir más
           lejos: siete chips cubren lo que la gente reserva de verdad, y el resto
           no justifica un calendario propio pudiendo usar el del sistema. -->
      <app-selector
        etiqueta="Día"
        estilo="chips"
        [opciones]="chipsDeDia()"
        [valor]="fecha()"
        (valorChange)="fecha.set($event)"
      />

      <div>
        <label for="fecha" class="block text-sm font-medium">Otro día</label>
        <!-- El cursor y el borde que responde: sin eso, el campo se lee como una
             etiqueta con una fecha escrita y nadie prueba a abrirlo. -->
        <input
          id="fecha"
          type="date"
          class="campo mt-1 w-auto cursor-pointer py-2 transition-colors
                 hover:border-primary"
          [value]="fecha()"
          (change)="cambiarFecha($event)"
        />
      </div>
    </div>

    <p class="mt-3 text-muted-foreground">{{ diaEnPalabras(fecha()) }}</p>

    <!-- Los filtros salen de lo que la cancha ya declara —techada e
         iluminación—, así que filtran en el navegador sobre lo que ya llegó:
         una consulta más al servidor no traería nada nuevo. -->
    <app-selector
      class="mt-4 block"
      etiqueta="Filtrar canchas"
      [opciones]="FILTROS"
      [valor]="filtro()"
      (valorChange)="filtro.set($event)"
    />

    <!-- La leyenda no es decoración: los tres estados se distinguen por color,
         forma e ícono, y esto es lo que dice qué significa cada uno. -->
    <ul class="mt-4 flex flex-wrap gap-2">
      <li><app-insignia variante="libre">Libre</app-insignia></li>
      <li><app-insignia variante="neutro" icono="lock">Ocupado</app-insignia></li>
      <li><app-insignia variante="neutro" icono="build">En mantención</app-insignia></li>
    </ul>

    <!-- Los cambios de estado se anuncian: quien usa lector de pantalla no ve
         que la grilla se repobló. -->
    <div role="status" aria-live="polite" class="mt-6">
      @if (grillas.isLoading()) {
        <p class="text-muted-foreground">Buscando horas disponibles…</p>
      } @else if (grillas.error()) {
        <p class="text-destructive">
          No se pudo cargar la disponibilidad. Reintenta en un momento.
        </p>
      } @else if (grillas.value().length === 0) {
        <p class="text-muted-foreground">El club no tiene canchas publicadas.</p>
      } @else if (visibles().length === 0) {
        <!-- Filtrar hasta quedarse sin nada es un callejón: la salida está acá,
             no en volver a probar los cuatro filtros a ver cuál era. -->
        <app-estado-vacio
          icono="filter_alt_off"
          titulo="Ninguna cancha cumple ese filtro"
          detalle="El club no tiene canchas de ese tipo publicadas hoy."
        >
          <button
            type="button"
            class="boton boton-primario"
            (click)="filtro.set('todas')"
          >
            Ver todas las canchas
          </button>
        </app-estado-vacio>
      } @else {
        <!-- Que la carga terminó también hay que decirlo: quien usa lector de
             pantalla oyó "buscando" y después se quedaría en silencio, sin saber
             si la grilla se repobló ni con cuánto. -->
        <p class="sr-only">{{ resumen() }}</p>
      }
    </div>

    @for (grilla of visibles(); track grilla.cancha.id) {
      <section class="mt-8" [attr.aria-labelledby]="'cancha-' + grilla.cancha.id">
        <h2
          [id]="'cancha-' + grilla.cancha.id"
          class="font-display text-xl font-semibold"
        >
          {{ grilla.cancha.nombre }}
        </h2>
        <p class="mt-1 flex flex-wrap items-center gap-2">
          <app-insignia variante="info" icono="sports_tennis">
            {{ superficie(grilla.cancha.superficie) }}
          </app-insignia>
          @if (grilla.cancha.techada) {
            <app-insignia variante="neutro" icono="roofing">Techada</app-insignia>
          }
          @if (grilla.cancha.iluminacion) {
            <app-insignia variante="neutro" icono="lightbulb">
              Con iluminación
            </app-insignia>
          }
        </p>

        @if (grilla.bloques.length === 0) {
          <p class="mt-3 text-muted-foreground">
            Esta cancha no abre este día.
          </p>
        } @else {
          <!-- auto-fill con un mínimo de 9rem: a 375px entran dos columnas y a
               partir de ahí las que quepan, sin scroll horizontal en ningún ancho. -->
          <ul
            class="mt-3 grid gap-3 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]"
          >
            @for (bloque of grilla.bloques; track bloque.inicio; let i = $index) {
              <li
                class="bloque rounded-xl border shadow-sm"
                [class.border-border]="!noSePuedeTomar(bloque)"
                [class.border-dashed]="noSePuedeTomar(bloque)"
                [class.border-muted-foreground]="noSePuedeTomar(bloque)"
                [class.opacity-70]="noSePuedeTomar(bloque)"
                [class.bg-busy]="bloque.reservado"
                [class.bg-muted]="bloque.bloqueado"
                [class.bg-accent-soft]="!noSePuedeTomar(bloque) && !estaElegido(bloque)"
                [class.bg-selected]="estaElegido(bloque)"
                [class.border-primary]="estaElegido(bloque)"
                [style.--i]="i"
              >
                <!-- Botón solo si se puede tomar: un bloque en mantención o ya
                     reservado no es interactivo, y anunciarlo como botón hace que
                     un lector de pantalla ofrezca algo que no se puede hacer. -->
                <button
                  type="button"
                  class="block w-full rounded-xl p-3 text-left"
                  [class.cursor-pointer]="!noSePuedeTomar(bloque)"
                  [disabled]="noSePuedeTomar(bloque)"
                  [attr.aria-label]="etiqueta(grilla.cancha, bloque)"
                  [attr.aria-pressed]="noSePuedeTomar(bloque) ? null : estaElegido(bloque)"
                  (click)="elegir(grilla.cancha, bloque)"
                >
                <p class="font-display text-lg font-semibold">
                  {{ hora(bloque.inicio) }}–{{ hora(bloque.fin) }}
                </p>

                @if (bloque.reservado) {
                  <p class="mt-2">
                    <app-insignia variante="neutro" icono="lock">Ocupado</app-insignia>
                  </p>
                } @else if (bloque.bloqueado) {
                  <!-- Insignia con ícono y borde punteado, no solo el color
                       apagado: el par verde/rojo es justo el que no distingue
                       quien tiene daltonismo rojo-verde. -->
                  <p class="mt-2">
                    <app-insignia variante="neutro" icono="build">
                      {{ motivo(bloque.motivoBloqueo) }}
                    </app-insignia>
                  </p>
                } @else {
                  <p class="mt-2 flex flex-wrap gap-1">
                    @if (estaElegido(bloque)) {
                      <app-insignia variante="info" icono="check_circle">
                        Elegida
                      </app-insignia>
                    } @else {
                      <app-insignia variante="libre">Libre</app-insignia>
                    }
                    @if (bloque.esPico) {
                      <app-insignia variante="aviso" icono="trending_up">
                        Hora pico
                      </app-insignia>
                    }
                  </p>
                  <!-- Las dos tarifas juntas: un monto suelto no dice a quién le
                       toca, y el socio leía el precio del arriendo en una hora que
                       para él es gratis. -->
                  <p class="mt-2 flex items-baseline justify-between gap-2 text-sm">
                    <span class="font-medium text-muted-foreground">Socio</span>
                    <span class="font-semibold text-accent-strong">
                      {{ tarifaDelSocio }}
                    </span>
                  </p>
                  <p class="flex items-baseline justify-between gap-2 text-sm">
                    <span class="font-medium text-muted-foreground">Arriendo</span>
                    <span class="font-semibold text-accent-strong">
                      {{ pesos(bloque.montoClp) }}
                    </span>
                  </p>
                }
                </button>

                <!-- Fuera del botón del bloque: un botón dentro de otro no es HTML
                     válido, y el lector de pantalla anunciaría uno solo. -->
                @if (reportable(bloque); as caso) {
                  <div class="px-3 pb-3">
                    @if (caso.yaReportada) {
                      <p class="text-xs text-muted-foreground">
                        Ya reportaste esta hora.
                      </p>
                    } @else {
                      <button
                        type="button"
                        class="cursor-pointer rounded-md border border-border px-2 py-1
                               text-xs font-medium text-muted-foreground transition-colors
                               hover:bg-muted"
                        (click)="reportar(caso.reservaId)"
                      >
                        Reportar hora no usada
                        <span class="sr-only">
                          de las {{ hora(bloque.inicio) }} en
                          {{ grilla.cancha.nombre }}
                        </span>
                      </button>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        }
      </section>
    }

    <!-- Elegir y reservar quedaron separados: el bloque se marca, la barra dice
         qué se marcó y con cuánto, y recién "Reservar" abre el formulario. El
         diálogo que ya existía sigue siendo el que pide acompañantes y cobra. -->
    @if (elegido(); as eleccion) {
      <app-barra-fija>
        <div role="status" aria-live="polite">
          <p class="font-display text-lg font-semibold">
            {{ eleccion.cancha.nombre }} ·
            {{ hora(eleccion.bloque.inicio) }}–{{ hora(eleccion.bloque.fin) }}
          </p>
          <p class="text-sm text-muted-foreground">
            Socio {{ tarifaDelSocio }} · Arriendo
            <span class="font-semibold text-accent-strong">
              {{ pesos(eleccion.bloque.montoClp) }}
            </span>
            @if (eleccion.bloque.esPico) {
              · Hora pico
            }
          </p>
        </div>

        <div class="flex gap-2">
          <button type="button" class="boton boton-texto" (click)="elegido.set(null)">
            Soltar
          </button>
          <button type="button" class="boton boton-primario" (click)="reservar()">
            Reservar
          </button>
        </div>
      </app-barra-fija>
    }

    @if (reservando(); as eleccion) {
      <app-reservar
        [cancha]="eleccion.cancha"
        [bloque]="eleccion.bloque"
        (cerrar)="reservando.set(null)"
        (reservado)="confirmar($event)"
      />
    }
  `,
  styles: `
    /* El stagger de MASTER.md § Motion, en CSS puro: sin dependencia y sin JS en
       el hilo principal. Solo opacity y transform. */
    .bloque {
      transition:
        opacity 400ms,
        transform 400ms;
      transition-timing-function: linear(0, 0.6 30%, 1.05 60%, 1);
      /* Topeado en 12: con 60ms por bloque, el número 40 entraría 2,4 s después
         de que la grilla ya está lista. */
      transition-delay: calc(min(var(--i), 12) * 60ms);

      @starting-style {
        opacity: 0;
        transform: translateY(16px) scale(0.92);
      }
    }

    /* Que la tarjeta responde al mouse hay que mostrarlo, no solo saberlo: el
       cursor lo dice sobre el botón y esto lo dice sobre el bloque entero.

       Va en CSS y no con las variantes hover de Tailwind porque el borde y la
       sombra viven en el li mientras que el hover que importa es el del botón de
       adentro —el bloque tomado no tiene que iluminarse—, y porque el bloque
       arrastra hasta 720ms de retardo por el stagger: heredarlo dejaría el hover
       llegando tarde. Solo color de borde y sombra, así que nada cambia de tamaño
       y la cuadrícula no salta al pasar el ratón. */
    .bloque:has(button:not(:disabled):hover) {
      border-color: var(--color-primary);
      box-shadow: var(--shadow-md);
    }

    @media (prefers-reduced-motion: reduce) {
      .bloque {
        transition: none;
        transition-delay: 0ms;
      }
    }
  `,
})
export class Grilla {
  private readonly disponibilidad = inject(Disponibilidad);
  private readonly reservas = inject(Reservas);
  private readonly reportes = inject(ReportesDelSocio);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly fecha = signal(hoyEnElClub());

  /**
   * La reserva que se está reubicando, si se llegó desde "mis reservas".
   *
   * El modo viaja en la URL y no en un servicio compartido: así sobrevive a un
   * refresco y a compartir el enlace, y quien no viene de ahí no paga nada.
   */
  protected readonly moviendo = computed(() => {
    const id = Number(this.parametros()?.get('mover'));

    return Number.isInteger(id) && id > 0 ? id : null;
  });

  protected readonly errorAlMover = signal<string | null>(null);
  protected readonly avisoDeReporte = signal<string | null>(null);
  protected readonly enviandoMovimiento = signal(false);

  protected readonly grillas = resource({
    params: () => ({ fecha: this.fecha() }),
    loader: ({ params }) => this.disponibilidad.delDia(params.fecha),
    // Con valor por defecto, `value()` nunca lanza y el template no necesita
    // preguntar `hasValue()` antes de cada lectura.
    defaultValue: [],
  });

  /**
   * Qué horas de este día podría reportar quien mira, según el servidor.
   *
   * **Solo para socios, y sin preguntar si no lo es**: el endpoint es
   * `@SoloSocio()` y pedirlo igual llenaría de 403 la consola de cada visitante.
   *
   * La lista la decide el servidor —lo transcurrido, lo ajeno y lo que está dentro
   * del plazo—, y la grilla no vuelve a decidirlo por su cuenta: ofrecer un botón
   * sobre una hora que la API va a rechazar es prometer algo que no se puede.
   */
  private readonly reportables = resource({
    params: () => ({ fecha: this.fecha(), esSocio: this.esSocio() }),
    loader: ({ params }) =>
      params.esSocio
        ? this.reportes.reportables(params.fecha)
        : Promise.resolve([]),
    defaultValue: [],
  });

  private readonly esSocio = computed(
    () => this.auth.usuario()?.socioId != null,
  );

  /** Lo que oye quien no ve la grilla: cuántas horas quedan y en cuántas canchas. */
  protected readonly resumen = computed(() => {
    // Sobre las visibles y no sobre todas: si el filtro dejó fuera dos canchas,
    // anunciar las horas de esas dos contradice lo que hay en pantalla.
    const grillas = this.visibles();
    const libres = grillas.reduce(
      (total, g) =>
        total + g.bloques.filter((b) => !b.bloqueado && !b.reservado).length,
      0,
    );

    return `${libres} ${libres === 1 ? 'hora disponible' : 'horas disponibles'} en ${
      grillas.length === 1 ? '1 cancha' : `${grillas.length} canchas`
    }.`;
  });

  /** El bloque marcado en la grilla, el que muestra la barra de abajo. */
  protected readonly elegido = signal<{
    cancha: Cancha;
    bloque: BloqueDisponible;
  } | null>(null);

  /** El que ya pasó por "Reservar" y tiene el formulario abierto encima. */
  protected readonly reservando = signal<{
    cancha: Cancha;
    bloque: BloqueDisponible;
  } | null>(null);

  protected readonly filtro = signal('todas');

  protected readonly FILTROS = [
    { valor: 'todas', etiqueta: 'Todas' },
    { valor: 'techadas', etiqueta: 'Techadas' },
    { valor: 'iluminacion', etiqueta: 'Con iluminación' },
    { valor: 'aire-libre', etiqueta: 'Al aire libre' },
  ];

  /**
   * Las canchas que pasan el filtro.
   *
   * "Al aire libre" es lo contrario de techada y no un atributo propio: si fuera
   * un tercer campo del modelo, tarde o temprano existiría una cancha marcada
   * como techada y al aire libre a la vez.
   */
  protected readonly visibles = computed(() => {
    const filtro = this.filtro();

    return this.grillas.value().filter(({ cancha }) => {
      switch (filtro) {
        case 'techadas':
          return cancha.techada;
        case 'iluminacion':
          return cancha.iluminacion;
        case 'aire-libre':
          return !cancha.techada;
        default:
          return true;
      }
    });
  });

  /** Los siete chips de la tira de días, empezando por hoy. */
  protected readonly chipsDeDia = computed(() =>
    proximosDias(7).map((dia) => ({
      valor: dia.fecha,
      etiqueta: dia.etiqueta,
      sub: dia.numero,
    })),
  );

  protected estaElegido(bloque: BloqueDisponible): boolean {
    const eleccion = this.elegido();

    return (
      eleccion?.bloque.inicio === bloque.inicio &&
      eleccion?.bloque.canchaId === bloque.canchaId
    );
  }

  protected reservar(): void {
    this.reservando.set(this.elegido());
  }

  /** El caso reportable de ese bloque, si el servidor lo listó. */
  protected reportable(bloque: BloqueDisponible) {
    return this.reportables
      .value()
      .find(
        (caso) =>
          caso.canchaId === bloque.canchaId && caso.inicio === bloque.inicio,
      );
  }

  protected async reportar(reservaId: number): Promise<void> {
    this.avisoDeReporte.set(null);

    try {
      const { mensaje } = await this.reportes.reportar(reservaId);
      this.avisoDeReporte.set(mensaje);
      this.reportables.reload();
    } catch (falla) {
      this.avisoDeReporte.set(
        mensajeDelServidor(falla, 'No se pudo enviar el reporte.'),
      );
    }
  }

  protected noSePuedeTomar(bloque: BloqueDisponible): boolean {
    return bloque.bloqueado || bloque.reservado;
  }

  /**
   * Lo que oye quien navega por teclado antes de abrir el formulario.
   *
   * **Reemplaza al contenido del botón**, así que lo que no esté acá no existe para
   * quien usa lector de pantalla: van las dos tarifas —con un solo monto le llega
   * justo la mitad que falta para decidir— y la hora pico, que no es decoración
   * porque le gasta al socio un cupo semanal del que solo tiene dos.
   */
  protected etiqueta(cancha: Cancha, bloque: BloqueDisponible): string {
    const que = this.moviendo() !== null ? 'Mover tu reserva a' : 'Elegir';

    return (
      `${que} ${cancha.nombre} de ${this.hora(bloque.inicio)} a ` +
      `${this.hora(bloque.fin)}, socio ${TARIFA_DEL_SOCIO}, ` +
      `arriendo ${this.pesos(bloque.montoClp)}` +
      (bloque.esPico ? ', hora pico' : '')
    );
  }

  protected async elegir(
    cancha: Cancha,
    bloque: BloqueDisponible,
  ): Promise<void> {
    if (this.noSePuedeTomar(bloque)) return;

    const reservaId = this.moviendo();

    if (reservaId === null) {
      this.elegido.set({ cancha, bloque });
      return;
    }

    // Un solo movimiento en vuelo: con la red lenta, quien no ve reacción toca otro
    // bloque, y dos PATCH dejan la reserva donde responda el último, no donde eligió.
    if (this.enviandoMovimiento()) return;

    this.enviandoMovimiento.set(true);
    this.errorAlMover.set(null);

    try {
      await this.reservas.mover(reservaId, {
        canchaId: cancha.id,
        inicio: bloque.inicio,
      });
      await this.router.navigate(['/mis-reservas']);
    } catch (falla) {
      // Se queda en la grilla a propósito: la hora que eligió no se pudo, pero las
      // otras siguen ahí y volver atrás para reintentar sería un paso de más.
      this.errorAlMover.set(mensajeDeRechazo(falla).mensaje);
    } finally {
      this.enviandoMovimiento.set(false);
    }
  }

  /**
   * El socio no pasa por la pasarela: se va directo a su confirmación.
   *
   * Con el token, no solo con el folio: es lo que hace que su confirmación muestre
   * el resumen y el QR, igual que la de quien vuelve de Webpay. Sin él, el socio
   * llegaba a una pantalla con un número y nada más.
   */
  protected confirmar(reserva: { folio: string; token: string }): void {
    this.reservando.set(null);
    this.elegido.set(null);
    void this.router.navigate(['/reservas/confirmacion'], {
      queryParams: { folio: reserva.folio, t: reserva.token },
    });
  }

  protected cambiarFecha(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;

    // El input vacío —se puede borrar con el teclado— no dispara una consulta
    // que la API va a rechazar.
    if (valor) {
      this.fecha.set(valor);
    }
  }

  protected readonly hora = horaEnElClub;
  protected readonly pesos = enPesos;
  protected readonly tarifaDelSocio = TARIFA_DEL_SOCIO;
  protected readonly diaEnPalabras = diaEnPalabras;

  protected motivo(motivo: BloqueDisponible['motivoBloqueo']): string {
    return (motivo && MOTIVOS[motivo]) ?? 'No disponible';
  }

  protected superficie(superficie: string): string {
    return SUPERFICIES[superficie] ?? superficie;
  }
}
