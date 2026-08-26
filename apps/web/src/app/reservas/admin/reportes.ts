import { Component, inject, resource, signal } from '@angular/core';

import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { Decision, HoraReportada, Reportes } from './reportes.service';

/**
 * Las horas que algún socio reportó como no usadas, para que el club decida.
 *
 * **El sistema no sanciona solo.** Un castigo automático convierte el botón de
 * reportar en un arma: dos socios molestos dejan a un tercero sin reservar quince
 * días y nadie revisó nada. El costo es que alguien mire esta lista, y el club ya
 * tiene a esa persona.
 */
@Component({
  selector: 'app-reportes',
  imports: [EstadoVacio, Insignia],
  template: `
    <h1 class="font-display text-3xl font-bold">Horas reportadas</h1>
    <p class="mt-1 text-muted-foreground">
      Un socio avisó que estas horas quedaron sin usar. Los reportes son anónimos:
      el sistema no guarda ni muestra quién avisó.
    </p>

    <p role="status" aria-live="polite" class="mt-3 text-sm">
      @if (error()) {
        <span class="text-destructive">{{ error() }}</span>
      } @else if (aviso()) {
        <span class="text-accent-strong">{{ aviso() }}</span>
      }
    </p>

    @if (pendientes.isLoading()) {
      <p class="mt-6 text-muted-foreground">Cargando…</p>
    } @else if (pendientes.value(); as horas) {
      @if (horas.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="flag"
          titulo="No hay horas reportadas esperando decisión"
          detalle="Acá caen las que un socio marca como no usadas."
        />
      } @else {
        <ul class="mt-6 space-y-3">
          @for (reportada of horas; track reportada.reservaId) {
            <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 class="font-display text-lg font-semibold">
                  {{ dia(reportada.inicio) }}, {{ hora(reportada.inicio) }}–{{ hora(reportada.fin) }}
                </h2>
                <span class="text-sm text-muted-foreground">{{ reportada.cancha }}</span>
                <app-insignia variante="error" icono="flag">
                  {{ reportada.reportes === 1 ? '1 reporte' : reportada.reportes + ' reportes' }}
                </app-insignia>
              </div>

              @if (reportada.socio; as socio) {
                <p class="mt-1 text-sm">
                  Reservada por
                  <span class="font-medium">{{ socio.nombre }}</span>
                  <span class="text-muted-foreground">
                    (socio {{ socio.numeroSocio }})
                  </span>
                  @if (socio.sancionadoHasta) {
                    <span class="text-destructive">
                      · ya sancionado hasta {{ enDiaMes(socio.sancionadoHasta) }}
                    </span>
                  }
                </p>
              } @else {
                <p class="mt-1 text-sm text-muted-foreground">
                  La reservó un visitante sin cuenta: no hay socio a quien
                  sancionar.
                </p>
              }

              <div class="mt-3 flex flex-wrap gap-2">
                @if (reportada.socio) {
                  <button
                    type="button"
                    [disabled]="resolviendo()"
                    class="cursor-pointer rounded-md border border-destructive px-3 py-1
                           text-sm font-medium text-destructive transition-colors
                           hover:bg-destructive/10 disabled:opacity-60"
                    (click)="resolver(reportada, 'SANCIONAR')"
                  >
                    Sancionar
                    <span class="sr-only">a {{ reportada.socio!.nombre }}</span>
                  </button>
                }

                <button
                  type="button"
                  [disabled]="resolviendo()"
                  class="cursor-pointer rounded-md border border-border px-3 py-1 text-sm
                         font-medium transition-colors hover:bg-muted disabled:opacity-60"
                  (click)="resolver(reportada, 'DESCARTAR')"
                >
                  Descartar
                  <span class="sr-only">
                    los reportes de la hora {{ hora(reportada.inicio) }}
                  </span>
                </button>
              </div>
            </li>
          }
        </ul>
      }
    }
  `,
})
export class ReportesPanel {
  private readonly api = inject(Reportes);

  protected readonly resolviendo = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly pendientes = resource({
    params: () => ({ version: this.version() }),
    loader: () => this.api.pendientes(),
  });

  protected async resolver(
    reportada: HoraReportada,
    decision: Decision,
  ): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.resolviendo.set(true);

    try {
      const { sancionadoHasta } = await this.api.resolver(
        reportada.reservaId,
        decision,
      );

      // Hasta qué día, no "sancionado" a secas: es el dato que el club va a tener
      // que repetirle a esa persona cuando llame.
      this.aviso.set(
        sancionadoHasta
          ? `${reportada.socio?.nombre} queda sin reservar hasta el ${this.enDiaMes(sancionadoHasta)}.`
          : 'Sin sanción: los reportes de esa hora quedaron descartados.',
      );
      this.version.update((v) => v + 1);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo resolver el reporte.'));
    } finally {
      this.resolviendo.set(false);
    }
  }

  protected readonly hora = horaEnElClub;

  protected dia(instante: string): string {
    return diaEnPalabras(fechaEnElClub(instante));
  }

  /** "05-09-2026", como lo escribiría el club. */
  protected enDiaMes(fecha: string): string {
    const [ano, mes, dia] = fecha.slice(0, 10).split('-');

    return `${dia}-${mes}-${ano}`;
  }
}
