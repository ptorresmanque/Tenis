import { Component, computed, inject, resource, signal } from '@angular/core';

import { enPesos, hoyEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { CuotaDelMes, Cuotas, MedioPago } from '../cuotas.service';

const MEDIOS: Record<MedioPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  WEBPAY: 'Webpay',
};

/** El mes en curso del club, "AAAA-MM". */
function mesActual(): string {
  return hoyEnElClub().slice(0, 7);
}

/**
 * Las cuotas del mes.
 *
 * **No hay botón de "emitir".** Abrir el mes es lo que lo emite, que es la decisión de
 * `SPEC-cuotas.md`: un botón que hay que acordarse de apretar tiene el mismo problema
 * que el cron que se decidió no tener —falla en silencio— y encima invita a apretarlo
 * dos veces.
 */
@Component({
  selector: 'app-panel-cuotas',
  imports: [Aviso, EstadoVacio, Insignia],
  template: `
    <h1 class="font-display text-3xl font-bold">Cuotas del club</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      La cuota de cada socio activo, mes a mes. Se emite sola al abrir el mes. La
      incorporación aparece en el mes en que el socio entró.
    </p>

    <div class="mt-4 flex flex-wrap items-end gap-4">
      <div>
        <label for="mes" class="block text-sm font-medium">Mes</label>
        <input
          id="mes"
          type="month"
          class="campo mt-1 cursor-pointer"
          [value]="mes()"
          (change)="cambiarMes($event)"
        />
      </div>

      @if (datos.value(); as mes) {
        <dl class="flex flex-wrap gap-6">
          <div>
            <dt class="text-sm text-muted-foreground">Emitido</dt>
            <dd class="font-display text-xl font-semibold">
              {{ pesos(mes.totalEmitidoClp) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted-foreground">Pagado</dt>
            <dd class="font-display text-xl font-semibold text-accent-strong">
              {{ pesos(mes.totalPagadoClp) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted-foreground">Por cobrar</dt>
            <dd class="font-display text-xl font-semibold text-destructive">
              {{ pesos(porCobrar()) }}
            </dd>
          </div>
        </dl>
      }
    </div>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }
    @if (aviso(); as texto) {
      <app-aviso variante="exito" class="mt-4 block">{{ texto }}</app-aviso>
    }

    @if (datos.isLoading()) {
      <p class="mt-4 text-muted-foreground">Cargando…</p>
    } @else if (cuotas().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="payments"
        titulo="Ninguna cuota en este mes"
        detalle="Se emiten a los socios activos desde el mes en que ingresaron."
      />
    } @else {
      <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        <table class="tabla">
          <caption class="sr-only">
            Cuotas de {{ mes() }}, {{ cuotas().length }} en total
          </caption>
          <thead>
            <tr>
              <th scope="col">Nº</th>
              <th scope="col">Socio</th>
              <th scope="col">Monto</th>
              <th scope="col">Estado</th>
              <th scope="col"><span class="sr-only">Cobrar</span></th>
            </tr>
          </thead>
          <tbody>
            @for (cuota of cuotas(); track cuota.id) {
              <tr>
                <td class="font-mono text-sm">{{ cuota.socio.numeroSocio }}</td>
                <td class="font-medium">
                  {{ cuota.socio.nombre }}
                  @if (cuota.tipo === 'INCORPORACION') {
                    <!-- Marcada y no escondida: es deuda de este mes, y un socio nuevo
                         debe dos cuotas. Sin la marca, el club ve su nombre dos veces
                         con montos distintos y no entiende. -->
                    <app-insignia variante="info" icono="person_add">
                      Incorporación
                    </app-insignia>
                  }
                </td>
                <td class="whitespace-nowrap">
                  {{ pesos(cuota.montoClp - cuota.descuentoClp) }}
                  @if (cuota.descuentoClp > 0) {
                    <span class="block text-xs text-muted-foreground">
                      con {{ pesos(cuota.descuentoClp) }} de descuento
                    </span>
                  }
                </td>
                <td>
                  @if (cuota.estado === 'PAGADA') {
                    <app-insignia variante="exito" icono="check_circle">
                      Pagada
                    </app-insignia>
                  } @else if (cuota.estado === 'ANULADA') {
                    <app-insignia variante="neutro" icono="block">Anulada</app-insignia>
                  } @else {
                    <app-insignia variante="aviso" icono="schedule">
                      Por cobrar
                    </app-insignia>
                  }
                </td>
                <td>
                  @if (cuota.estado === 'PENDIENTE') {
                    <div class="flex flex-wrap gap-1">
                      <button
                        type="button"
                        class="boton boton-secundario boton-chico"
                        [disabled]="cobrando()"
                        (click)="cobrar(cuota, 'EFECTIVO')"
                      >
                        Efectivo
                      </button>
                      <button
                        type="button"
                        class="boton boton-secundario boton-chico"
                        [disabled]="cobrando()"
                        (click)="cobrar(cuota, 'TRANSFERENCIA')"
                      >
                        Transferencia
                      </button>
                      <!-- Los dos ajustes piden un motivo que el servidor exige, y son
                           de los que el club usa una vez al mes: un formulario propio
                           para eso es una pantalla más que mantener. -->
                      <button
                        type="button"
                        class="boton boton-texto boton-chico"
                        [disabled]="cobrando()"
                        (click)="condonar(cuota)"
                      >
                        Condonar
                      </button>
                      <button
                        type="button"
                        class="boton boton-texto boton-chico text-destructive"
                        [disabled]="cobrando()"
                        (click)="anular(cuota)"
                      >
                        Anular
                      </button>
                    </div>
                  } @else if (cuota.medio) {
                    <span class="text-sm text-muted-foreground">
                      {{ nombreMedio(cuota.medio) }}
                    </span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class PanelDeCuotas {
  private readonly api = inject(Cuotas);

  protected readonly mes = signal(mesActual());

  protected readonly datos = resource({
    params: () => ({ periodo: this.mes() }),
    loader: ({ params }) => this.api.delMes(params.periodo),
  });

  protected readonly cuotas = computed<CuotaDelMes[]>(
    () => this.datos.value()?.cuotas ?? [],
  );

  /**
   * Lo que falta entrar. Calculado y no leído del servidor porque es una resta de dos
   * números que ya viajaron: pedirlo aparte sería un tercer total que puede quedar en
   * desacuerdo con los otros dos.
   */
  protected readonly porCobrar = computed(() => {
    const mes = this.datos.value();

    return mes ? mes.totalEmitidoClp - mes.totalPagadoClp : 0;
  });

  protected readonly cobrando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly pesos = enPesos;

  protected nombreMedio(medio: MedioPago): string {
    return MEDIOS[medio] ?? medio;
  }

  /**
   * Cobra y recarga el mes.
   *
   * Dos botones y no un selector con confirmación: en el mesón hay alguien esperando,
   * y el medio es lo único que hay que elegir. El aviso dice hasta cuándo quedó al día
   * porque es lo que el socio pregunta a continuación.
   */
  protected async cobrar(
    cuota: CuotaDelMes,
    medio: 'EFECTIVO' | 'TRANSFERENCIA',
  ): Promise<void> {
    await this.intentar(async () => {
      await this.api.cobrar(cuota.id, medio);
      // La incorporación no extiende la vigencia —compra la entrada, no tiempo—, así
      // que prometer que "queda al día hasta fin de mes" sería mentirle al admin justo
      // en la pantalla donde va a cobrar la mensualidad a continuación.
      this.aviso.set(
        cuota.tipo === 'INCORPORACION'
          ? `Cobrada la incorporación de ${cuota.socio.nombre}. Ya puede reservar; su mensualidad va aparte.`
          : `Cobrada la cuota de ${cuota.socio.nombre}. Queda al día hasta fin de ${cuota.periodo}.`,
      );
    });
  }

  /**
   * Condonar: cobrar cero por una razón. **Deja al socio al día ese mes**, porque el
   * mes se lo dieron igual.
   */
  protected async condonar(cuota: CuotaDelMes): Promise<void> {
    const motivo = this.pedirMotivo(
      `¿Por qué se le condona la cuota a ${cuota.socio.nombre}? Queda escrito en la cuota.`,
    );

    if (motivo === null) return;

    await this.intentar(async () => {
      await this.api.ajustar(cuota.id, { condonar: true, motivo });
      this.aviso.set(
        `Condonada la cuota de ${cuota.socio.nombre}. Queda al día ese mes igual.`,
      );
    });
  }

  /**
   * Anular: deshacer una emisión equivocada. **No deja al día a nadie**: esa cuota
   * nunca debió existir.
   */
  protected async anular(cuota: CuotaDelMes): Promise<void> {
    const motivo = this.pedirMotivo(
      `¿Por qué se anula esta cuota de ${cuota.socio.nombre}? No es lo mismo que ` +
        'condonarla: anular es decir que no correspondía emitirla.',
    );

    if (motivo === null) return;

    await this.intentar(async () => {
      await this.api.ajustar(cuota.id, { anular: true, motivo });
      this.aviso.set(`Anulada la cuota de ${cuota.socio.nombre}.`);
    });
  }

  /** El motivo, o `null` si la persona canceló o lo dejó en blanco. */
  private pedirMotivo(pregunta: string): string | null {
    const escrito = window.prompt(pregunta)?.trim();

    return escrito ? escrito : null;
  }

  /**
   * Corre la acción, recarga el mes y muestra el mensaje del servidor si falla.
   *
   * Compartido por los cuatro botones: los avisos son distintos, pero el manejo
   * —limpiar, bloquear, recargar, desbloquear— es el mismo en los cuatro.
   */
  private async intentar(accion: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.cobrando.set(true);

    try {
      await accion();
      this.datos.reload();
    } catch (falla) {
      // El del servidor: "Esa cuota ya estaba pagada" es el que importa, porque pasa
      // cuando dos personas trabajan desde dos pantallas.
      this.error.set(mensajeDelServidor(falla, 'No se pudo completar la acción.'));
    } finally {
      this.cobrando.set(false);
    }
  }

  protected cambiarMes(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;

    // El `<input type="month">` vacío devuelve "": quedarse en el mes anterior es
    // mejor que pedirle al servidor un período que va a rechazar.
    if (valor) this.mes.set(valor);
  }
}
