import { Component, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminCanchas } from '../../catalogo-canchas/admin/admin-canchas.service';
import { CanchaAdmin } from '../../catalogo-canchas/admin/admin-canchas.service';
import { horaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Transmision, Torneos } from '../torneos.service';

/** El formulario vacío. Función y no constante, para no compartir el objeto. */
const enBlanco = () => ({
  canchaId: 0,
  enlace: '',
  fecha: '',
  horaDesde: '09:00',
  horaHasta: '19:00',
  titulo: '',
});

/**
 * Los lives del torneo: **una cancha durante una jornada**.
 *
 * No es un video por partido, y decirlo acá importa porque es lo que el club esperaría:
 * se pone una cámara fija, se abre un live en la mañana y se cierra en la tarde, y ese
 * único video cubre los ocho partidos que se jugaron ahí. Cada partido encuentra el
 * suyo por cancha y hora.
 */
@Component({
  selector: 'app-transmisiones-del-torneo',
  imports: [FormsModule, Aviso],
  template: `
    <section class="mt-4 rounded-xl border border-border bg-muted/30 p-4">
      <h3 class="font-display text-base font-semibold">Transmisiones</h3>
      <p class="mt-1 max-w-prose text-sm text-muted-foreground">
        Se transmite <strong>una cancha durante una jornada</strong>, no un partido:
        abre el live en YouTube y pega su enlace acá. Cada partido programado en esa
        cancha y a esa hora lo encuentra solo.
      </p>

      @if (transmisiones.error()) {
        <p class="mt-3 text-sm text-destructive">
          No se pudieron cargar las transmisiones. Reintenta en un momento.
        </p>
      } @else if (transmisiones.value().length > 0) {
        <ul class="mt-3 grid gap-2">
          @for (transmision of transmisiones.value(); track transmision.id) {
            <li class="flex flex-wrap items-center gap-3 rounded-lg bg-card p-3">
              <span class="font-medium">{{ transmision.cancha }}</span>
              <span class="text-sm text-muted-foreground">
                {{ enHoras(transmision) }}
              </span>
              @if (transmision.titulo) {
                <span class="text-sm">{{ transmision.titulo }}</span>
              }

              <a
                class="boton boton-secundario boton-chico"
                [href]="transmision.url"
                target="_blank"
                rel="noopener"
              >
                Ver
              </a>

              <button
                type="button"
                class="boton boton-secundario boton-chico ms-auto
                       border-destructive text-destructive"
                [disabled]="trabajando()"
                (click)="quitar(transmision)"
              >
                Quitar
                <span class="sr-only">la transmisión de {{ transmision.cancha }}</span>
              </button>
            </li>
          }
        </ul>
      }

      <form class="mt-3 grid gap-3 sm:grid-cols-2" (ngSubmit)="anunciar()">
        <label class="block sm:col-span-2">
          <span class="text-sm font-medium">Enlace del video de YouTube</span>
          <input
            class="campo mt-1"
            name="enlace"
            placeholder="https://youtu.be/…"
            [(ngModel)]="datos.enlace"
          />
          <span class="text-sm text-muted-foreground">
            Sirve cualquiera de sus formas. Del enlace solo se guarda el identificador
            del video.
          </span>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Cancha</span>
          <select class="campo mt-1" name="cancha" [(ngModel)]="datos.canchaId">
            <option [value]="0" disabled>Elige una</option>
            <!-- **Solo las que tienen cámara.** El servidor rechaza las otras; acá ni
                 se ofrecen, para que el club no descubra el problema después de
                 anunciar el partido. -->
            @for (cancha of conCamara(); track cancha.id) {
              <option [value]="cancha.id">{{ cancha.nombre }}</option>
            }
          </select>
          @if (canchas.error()) {
            <span class="text-sm text-destructive">No se pudieron cargar las canchas.</span>
          } @else if (conCamara().length === 0 && !canchas.isLoading()) {
            <span class="text-sm text-muted-foreground">
              Ninguna cancha está marcada con cámara. Márcala en Canchas.
            </span>
          }
        </label>

        <label class="block">
          <span class="text-sm font-medium">Día</span>
          <input
            class="campo mt-1"
            type="date"
            name="fecha"
            [(ngModel)]="datos.fecha"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Desde</span>
          <input
            class="campo mt-1"
            type="time"
            name="desde"
            [(ngModel)]="datos.horaDesde"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Hasta</span>
          <input
            class="campo mt-1"
            type="time"
            name="hasta"
            [(ngModel)]="datos.horaHasta"
          />
        </label>

        <label class="block sm:col-span-2">
          <span class="text-sm font-medium">Título (opcional)</span>
          <input
            class="campo mt-1"
            name="titulo"
            maxlength="120"
            placeholder="Cancha 1 — sábado"
            [(ngModel)]="datos.titulo"
          />
        </label>

        <button
          type="submit"
          class="boton boton-secundario sm:col-span-2 sm:justify-self-start"
          [disabled]="trabajando()"
        >
          Anunciar la transmisión
        </button>
      </form>

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </section>
  `,
})
export class TransmisionesDelTorneo {
  private readonly api = inject(Torneos);
  private readonly canchasApi = inject(AdminCanchas);

  readonly torneoId = input.required<number>();

  protected datos = enBlanco();

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly transmisiones = resource({
    params: () => ({ id: this.torneoId(), version: this.version() }),
    loader: ({ params }) => this.api.transmisiones(params.id),
    defaultValue: [] as Transmision[],
  });

  protected readonly canchas = resource({
    loader: () => this.canchasApi.canchas(),
    defaultValue: [] as CanchaAdmin[],
  });

  protected conCamara() {
    if (!this.canchas.hasValue()) return [];

    return this.canchas.value().filter((cancha) => cancha.tieneCamara);
  }

  /**
   * "09:00 a 19:00", **con el reloj del club y no el del navegador**.
   *
   * `toLocaleTimeString` pelado formatea en la zona de quien mira: el mismo live se
   * leía dos horas antes desde un computador fuera de Chile. `horaEnElClub` es la
   * regla que el resto del sitio ya sigue.
   */
  protected enHoras(transmision: Transmision): string {
    return `${horaEnElClub(transmision.inicio)} a ${horaEnElClub(transmision.fin)}`;
  }

  protected async anunciar(): Promise<void> {
    this.error.set(null);

    if (!this.datos.enlace.trim() || !Number(this.datos.canchaId)) {
      this.error.set('Falta el enlace o la cancha.');
      return;
    }

    if (!this.datos.fecha) {
      this.error.set('Falta el día de la transmisión.');
      return;
    }

    await this.intentar(async () => {
      await this.api.anunciarTransmision(this.torneoId(), {
        canchaId: Number(this.datos.canchaId),
        enlace: this.datos.enlace.trim(),
        fecha: this.datos.fecha,
        horaDesde: this.datos.horaDesde,
        horaHasta: this.datos.horaHasta,
        titulo: this.datos.titulo.trim() || undefined,
      });
      this.datos = enBlanco();
    });
  }

  protected async quitar(transmision: Transmision): Promise<void> {
    await this.intentar(() =>
      this.api.quitarTransmision(this.torneoId(), transmision.id),
    );
  }

  private async intentar(accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);

    try {
      await accion();
    } catch (falla) {
      // El del servidor tal cual: dice si el enlace no era de YouTube, si la cancha no
      // tiene cámara o si esa ventana se pisa con otra.
      this.error.set(
        mensajeDelServidor(falla, 'No se pudo guardar la transmisión.'),
      );
    } finally {
      this.trabajando.set(false);
      this.version.update((veces) => veces + 1);
    }
  }
}
