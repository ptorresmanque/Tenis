import { Component, computed, inject, resource, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatButton, MatFabButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';
import { proveerCampos } from '../../ui/campos';
import { Esqueleto } from '../../ui/esqueleto';

import { mensajeDelServidor } from '../../core/errores';
import { Socios } from '../../identidad/admin/socios.service';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Jugador, Torneos } from '../torneos.service';
import { EnlaceTelefonoPipe, TelefonoPipe } from '../../core/telefono';
import { LO_HECHO } from '../../ui/material';
import { AnotarJugador, DatosParaAnotar } from './anotar-jugador';

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
  // Espacio al final para que el FAB no tape el último jugador (A9).
  host: { class: 'block pb-24' },
  imports: [
    MatSelectModule,
    MatFormFieldModule,
    MatButton,
    MatFabButton,
    Esqueleto,
    Aviso,
    EstadoVacio,
    EnlaceTelefonoPipe,
    TelefonoPipe,
    MatChipsModule,
    MatIcon,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: anotar es el FAB, que abre su diálogo
         (T292). Antes era un formulario fijo arriba de la lista. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Jugadores</h1>
        <p class="mt-1 text-muted-foreground">
          Quiénes juegan los torneos del club. Un socio que ya jugó conserva su jugador y
          con él sus puntos.
        </p>
      </div>
    </header>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }

    <button matFab extended type="button" class="fab-de-la-pantalla" (click)="anotar()">
      <mat-icon aria-hidden="true">person_add</mat-icon>
      Anotar jugador
    </button>

    @if (jugadores.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando los jugadores…" />
    } @else if (jugadores.error()) {
      <p class="mt-4 text-destructive">
        No se pudieron cargar los jugadores. Reintenta en un momento.
      </p>
    } @else if (jugadores.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="groups"
        titulo="Todavía no hay jugadores"
        detalle="Anota al primero con «Anotar jugador»."
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
              <mat-chip-set class="insignias">
                <mat-chip class="insignia info">
                  <mat-icon matChipAvatar aria-hidden="true">badge</mat-icon>
                  Socio {{ jugador.numeroSocio }}
                </mat-chip>
              </mat-chip-set>
            } @else {
              <mat-chip-set class="insignias">
                <mat-chip class="insignia neutro">
                  <mat-icon matChipAvatar aria-hidden="true">person</mat-icon>
                  De afuera
                </mat-chip>
              </mat-chip-set>
            }

            @if (jugador.telefono) {
              <a class="text-sm underline" [href]="jugador.telefono | enlaceTelefono">
                {{ jugador.telefono | telefono }}
              </a>
            }

            @if (!jugador.socioId) {
              <!-- Enlazar escribe un campo: el jugador es el mismo y sus puntos
                   siguen siendo suyos. -->
              <mat-form-field class="chico ms-auto w-auto">
                <mat-label>Enlazar a socio</mat-label>
                <mat-select
                  [attr.name]="'enlace-' + jugador.id"
                  [value]="0"
                  [disabled]="trabajando()"
                  (selectionChange)="enlazar(jugador, $event.value)"
                >
                  <mat-option [value]="0">—</mat-option>
                  @for (socio of sociosSinJugador(); track socio.id) {
                    <mat-option [value]="socio.id">
                      {{ socio.numeroSocio }} · {{ socio.usuario.apellido }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }

            <button
              matButton
              type="button"
              class="chico"
              [class.ms-auto]="!!jugador.socioId"
              [disabled]="trabajando()"
              [attr.aria-busy]="enCurso() === 'cambiarActividad-' + jugador.id"
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
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogos = inject(MatDialog);
  private readonly api = inject(Torneos);
  private readonly sociosApi = inject(Socios);

  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

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
    // Se lee aunque alguna de las dos no haya cargado: el diálogo de anotar se abre igual.
    const conJugador = new Set(
      (this.jugadores.hasValue() ? this.jugadores.value() : [])
        .map((jugador) => jugador.socioId)
        .filter((id): id is number => id !== null),
    );

    return (this.socios.hasValue() ? this.socios.value().socios : []).filter(
      (socio) => !conJugador.has(socio.id),
    );
  });

  /** Abre el diálogo de anotar (T292), con los socios que todavía no tienen jugador. */
  protected async anotar(): Promise<void> {
    const jugador = await firstValueFrom(
      this.dialogos
        .open<AnotarJugador, DatosParaAnotar, Jugador>(AnotarJugador, {
          data: { socios: this.sociosSinJugador },
          width: '32rem',
          maxWidth: '92vw',
        })
        .afterClosed(),
    );
    if (!jugador) return;

    this.snackBar.open(
      `${jugador.nombre} ${jugador.apellido} ya puede jugar torneos.`,
      undefined,
      LO_HECHO,
    );
    this.version.update((v) => v + 1);
  }

  protected async enlazar(jugador: Jugador, socioId: number): Promise<void> {
    if (socioId === 0) return;

    await this.intentar(`enlazar-${jugador.id}`, async () => {
      await this.api.editarJugador(jugador.id, { socioId });
      this.snackBar.open(
        `${jugador.nombre} ${jugador.apellido} quedó enlazado a su ficha de socio, ` +
          'con los puntos que ya tenía.',
        undefined,
        LO_HECHO,
      );
    });
  }

  protected async cambiarActividad(jugador: Jugador): Promise<void> {
    await this.intentar(`cambiarActividad-${jugador.id}`, () =>
      this.api.editarJugador(jugador.id, { activo: !jugador.activo }),
    );
  }

  private async intentar(
    clave: string,
    accion: () => Promise<unknown>,
  ): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si ese socio ya juega con otro nombre, que es lo que el
      // club necesita saber para decidir con cuál se queda.
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar el cambio.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}
