import { Component, computed, inject, resource, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { EstadoVacio } from '../ui/estado-vacio';
import { Insignia } from '../ui/insignia';
import { Cuotas, MiCuota } from './cuotas.service';

/** Cómo se lee cada período en pantalla: "agosto de 2026". */
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Lo que el socio debe, y el botón para pagarlo.
 *
 * **Es la pantalla que evita la conversación incómoda en el mesón**, y la razón por la
 * que este módulo se hizo completo. Quien está moroso se entera acá y lo resuelve sin
 * hablar con nadie.
 *
 * Quien todavía no es socio ve una cuenta vacía en vez de un error: llega desde el
 * mismo menú, y un 403 se lee como que el sistema está roto.
 */
@Component({
  selector: 'app-mi-cuenta',
  imports: [Aviso, EstadoVacio, Insignia],
  template: `
    <h1 class="font-display text-3xl font-bold">Mi cuenta</h1>

    @if (vueltaDelPago(); as estado) {
      @if (estado === 'listo') {
        <app-aviso variante="exito" titulo="Pago recibido" class="mt-4 block">
          Gracias. Ya quedó registrado y puedes volver a reservar.
        </app-aviso>
      } @else if (estado === 'rechazado') {
        <app-aviso variante="error" titulo="El pago no se completó" class="mt-4 block">
          El banco rechazó la operación. Puedes intentarlo de nuevo o pagar en el club.
        </app-aviso>
      } @else {
        <app-aviso variante="aviso" class="mt-4 block">
          Anulaste el pago. Tu cuota sigue pendiente.
        </app-aviso>
      }
    }

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }

    @if (cuenta.value(); as datos) {
      @if (datos.deudaClp > 0) {
        <p class="mt-4 text-lg">
          Debes
          <strong class="font-display text-2xl text-destructive">
            {{ pesos(datos.deudaClp) }}
          </strong>
        </p>
      } @else if (datos.cuotas.length > 0) {
        <p class="mt-4 text-lg text-accent-strong">Estás al día. Gracias.</p>
      }

      @if (datos.cuotas.length === 0) {
        <app-estado-vacio
          class="mt-4 block"
          icono="receipt_long"
          titulo="No tienes cuotas"
          detalle="Cuando el club emita la primera, aparece acá."
        />
      } @else {
        <ul class="mt-4 grid gap-3">
          @for (cuota of datos.cuotas; track cuota.id) {
            <li
              class="flex flex-wrap items-center gap-3 rounded-xl border border-border
                     bg-card p-4 shadow-sm"
            >
              <div class="min-w-0 flex-1">
                <p class="font-display text-lg font-semibold">
                  {{ nombrePeriodo(cuota) }}
                </p>
                <p class="text-sm text-muted-foreground">
                  {{ pesos(cuota.montoClp - cuota.descuentoClp) }}
                  @if (cuota.descuentoClp > 0) {
                    · con descuento
                  }
                </p>
              </div>

              @if (cuota.estado === 'PAGADA') {
                <app-insignia variante="exito" icono="check_circle">
                  Pagada
                </app-insignia>
              } @else {
                <app-insignia variante="aviso" icono="schedule">
                  Por pagar
                </app-insignia>
                <button
                  type="button"
                  class="boton boton-primario boton-chico"
                  [disabled]="pagando()"
                  (click)="pagar(cuota)"
                >
                  Pagar en línea
                </button>
              }
            </li>
          }
        </ul>
      }
    }
  `,
})
export class MiCuenta {
  private readonly api = inject(Cuotas);

  /**
   * Cómo volvió la persona de la pasarela: `listo`, `rechazado` o `anulado`.
   *
   * Lo pone el retorno del servidor en la URL. Sin esto, quien vuelve de pagar no ve
   * ninguna señal de que su pago entró y aprieta otra vez.
   */
  private readonly parametros = toSignal(
    inject(ActivatedRoute).queryParamMap,
    { initialValue: null },
  );

  protected readonly vueltaDelPago = computed(
    () => this.parametros()?.get('pago') ?? null,
  );

  // Por el servicio y no con `httpResource` directo: el pago ya va por ahí, y una
  // pantalla que lee por un camino y escribe por otro obliga a sus tests a doblar los
  // dos. Es además lo que hace el panel del admin.
  protected readonly cuenta = resource({
    loader: () => this.api.mias(),
  });

  protected readonly pagando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly pesos = enPesos;

  protected nombrePeriodo(cuota: MiCuota): string {
    if (cuota.tipo === 'INCORPORACION') return 'Incorporación al club';

    const [anio, mes] = cuota.periodo.split('-').map(Number);

    return `${MESES[mes - 1] ?? cuota.periodo} de ${anio}`;
  }

  /**
   * Manda a la pasarela.
   *
   * Se sale de la aplicación con `location.href` y no con el router: del otro lado hay
   * un dominio ajeno, y el router de Angular no navega fuera del sitio.
   */
  protected async pagar(cuota: MiCuota): Promise<void> {
    this.error.set(null);
    this.pagando.set(true);

    try {
      const { urlRedireccion } = await this.api.pagar(cuota.id);
      window.location.href = urlRedireccion;
    } catch (falla) {
      this.error.set(
        mensajeDelServidor(falla, 'No se pudo iniciar el pago. Reintenta.'),
      );
      this.pagando.set(false);
    }
  }
}
