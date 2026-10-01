import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Esqueleto } from '../../ui/esqueleto';

import { mensajeDelServidor } from '../../core/errores';
import { Socios } from '../../identidad/admin/socios.service';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { Selector } from '../../ui/selector';
import { Jugador, Torneos } from '../torneos.service';

/**
 * Quiénes juegan torneos.
 *
 * **El jugador no es el socio**, y esta pantalla es donde eso se ve: el socio se anota
 * eligiéndolo de su ficha —y si ya jugó, se reutiliza el jugador que tiene—, y el de
 * afuera se escribe una vez y queda disponible para el torneo siguiente.
 *
 * **Enlazar un externo a una ficha de socio no crea nada nuevo**: sus puntos y sus
 * partidos cuelgan del jugador, así que hacerse socio no puede significar empezar de
 * cero en la tabla.
 */
@Component({
  selector: 'app-jugadores',
  imports: [Esqueleto, FormsModule, Aviso, EstadoVacio, Insignia, Selector],
  template: `
    <h1 class="font-display text-3xl font-bold">Jugadores</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Quiénes juegan los torneos del club. Un socio que ya jugó conserva su jugador y
      con él sus puntos.
    </p>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }
    @if (aviso(); as texto) {
      <app-aviso variante="exito" class="mt-4 block">{{ texto }}</app-aviso>
    }

    <form
      class="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm"
      (ngSubmit)="anotar()"
    >
      <h2 class="font-display text-lg font-semibold">Anotar un jugador</h2>

      <app-selector
        class="mt-3 block"
        etiqueta="A quién se anota"
        [opciones]="TIPOS"
        [(valor)]="tipo"
      />

      <div class="mt-3 flex flex-wrap items-end gap-3">
        @if (tipo() === 'socio') {
          <label class="min-w-64 flex-1">
            <span class="text-sm font-medium">Socio</span>
            <select class="campo mt-1" name="socioId" [(ngModel)]="socioId">
              <option [value]="0" disabled>Elige un socio</option>
              @for (socio of sociosSinJugador(); track socio.id) {
                <option [value]="socio.id">
                  {{ socio.numeroSocio }} · {{ socio.usuario.nombre }}
                  {{ socio.usuario.apellido }}
                </option>
              }
            </select>
          </label>
        } @else {
          <label class="flex-1">
            <span class="text-sm font-medium">Nombre</span>
            <input class="campo mt-1" name="nombre" [(ngModel)]="datos.nombre" />
          </label>
          <label class="flex-1">
            <span class="text-sm font-medium">Apellido</span>
            <input class="campo mt-1" name="apellido" [(ngModel)]="datos.apellido" />
          </label>
          <label class="flex-1">
            <span class="text-sm font-medium">Teléfono</span>
            <input
              class="campo mt-1"
              type="tel"
              name="telefono"
              [(ngModel)]="datos.telefono"
            />
          </label>
        }

        <button type="submit" class="boton boton-primario" [disabled]="trabajando()">
          Anotar
        </button>
      </div>
    </form>

    @if (jugadores.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando los jugadores…" />
    } @else if (jugadores.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="groups"
        titulo="Todavía no hay jugadores"
        detalle="Anota al primero con el formulario de arriba."
      />
    } @else {
      <ul class="mt-4 grid gap-2">
        @for (jugador of jugadores.value(); track jugador.id) {
          <li
            class="flex flex-wrap items-center gap-3 rounded-xl border border-border
                   bg-card p-3 shadow-sm"
          >
            <span class="font-medium" [class.line-through]="!jugador.activo">
              {{ jugador.apellido }}, {{ jugador.nombre }}
            </span>

            @if (jugador.numeroSocio) {
              <app-insignia variante="info" icono="badge">
                Socio {{ jugador.numeroSocio }}
              </app-insignia>
            } @else {
              <app-insignia variante="neutro" icono="person">De afuera</app-insignia>
            }

            @if (jugador.telefono) {
              <a class="text-sm underline" [href]="'tel:' + jugador.telefono">
                {{ jugador.telefono }}
              </a>
            }

            @if (!jugador.socioId) {
              <!-- Enlazar escribe un campo: el jugador es el mismo y sus puntos
                   siguen siendo suyos. -->
              <label class="ms-auto flex items-center gap-2">
                <span class="text-sm">Enlazar a socio</span>
                <select
                  class="campo campo-chico w-auto"
                  [name]="'enlace-' + jugador.id"
                  [disabled]="trabajando()"
                  (change)="enlazar(jugador, $any($event.target).value)"
                >
                  <option value="0">—</option>
                  @for (socio of sociosSinJugador(); track socio.id) {
                    <option [value]="socio.id">
                      {{ socio.numeroSocio }} · {{ socio.usuario.apellido }}
                    </option>
                  }
                </select>
              </label>
            }

            <button
              type="button"
              class="boton boton-texto boton-chico"
              [class.ms-auto]="!!jugador.socioId"
              [disabled]="trabajando()"
              (click)="cambiarActividad(jugador)"
            >
              {{ jugador.activo ? 'Desactivar' : 'Reactivar' }}
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class JugadoresPanel {
  private readonly api = inject(Torneos);
  private readonly sociosApi = inject(Socios);

  protected readonly TIPOS = [
    { valor: 'socio', etiqueta: 'Un socio' },
    { valor: 'externo', etiqueta: 'Alguien de afuera' },
  ];

  protected readonly tipo = signal('socio');
  protected socioId = 0;
  protected datos = { nombre: '', apellido: '', telefono: '' };

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly jugadores = resource({
    params: () => this.version(),
    loader: () => this.api.jugadores(),
    defaultValue: [] as Jugador[],
  });

  protected readonly socios = resource({ loader: () => this.sociosApi.listado() });

  /**
   * Los socios que todavía no tienen jugador.
   *
   * Elegir uno que ya lo tiene no rompe nada —el servidor devuelve el que existe—,
   * pero la lista sería una invitación a "anotar" a alguien que ya está anotado.
   */
  protected readonly sociosSinJugador = computed(() => {
    const conJugador = new Set(
      this.jugadores
        .value()
        .map((jugador) => jugador.socioId)
        .filter((id): id is number => id !== null),
    );

    return (this.socios.value()?.socios ?? []).filter(
      (socio) => !conJugador.has(socio.id),
    );
  });

  protected async anotar(): Promise<void> {
    const esSocio = this.tipo() === 'socio';

    await this.intentar(async () => {
      const jugador = await this.api.crearJugador(
        esSocio
          ? { socioId: Number(this.socioId) }
          : {
              nombre: this.datos.nombre,
              apellido: this.datos.apellido,
              telefono: this.datos.telefono,
            },
      );

      this.socioId = 0;
      this.datos = { nombre: '', apellido: '', telefono: '' };
      this.aviso.set(`${jugador.nombre} ${jugador.apellido} ya puede jugar torneos.`);
    });
  }

  protected async enlazar(jugador: Jugador, socioId: string): Promise<void> {
    if (socioId === '0') return;

    await this.intentar(async () => {
      await this.api.editarJugador(jugador.id, { socioId: Number(socioId) });
      this.aviso.set(
        `${jugador.nombre} ${jugador.apellido} quedó enlazado a su ficha de socio, ` +
          'con los puntos que ya tenía.',
      );
    });
  }

  protected async cambiarActividad(jugador: Jugador): Promise<void> {
    await this.intentar(() =>
      this.api.editarJugador(jugador.id, { activo: !jugador.activo }),
    );
  }

  private async intentar(accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si ese socio ya juega con otro nombre, que es lo que el
      // club necesita saber para decidir con cuál se queda.
      this.error.set(mensajeDelServidor(falla, 'No se pudo anotar al jugador.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
