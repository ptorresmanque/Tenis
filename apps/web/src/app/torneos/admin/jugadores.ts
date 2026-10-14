import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';
import { errorDelCampo, proveerCampos } from '../../ui/campos';
import { Esqueleto } from '../../ui/esqueleto';

import { mensajeDelServidor } from '../../core/errores';
import { Socios } from '../../identidad/admin/socios.service';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Jugador, Torneos } from '../torneos.service';
import { EnlaceTelefonoPipe, TelefonoPipe } from '../../core/telefono';
import { TelefonoDirective } from '../../ui/telefono';
import { LO_HECHO } from '../../ui/material';

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
  imports: [
    MatSelectModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    Esqueleto,
    FormsModule,
    Aviso,
    EstadoVacio,
    MatButtonToggleModule,
    EnlaceTelefonoPipe,
    TelefonoPipe,
    TelefonoDirective,
    MatChipsModule,
    MatIcon,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: anotar es el formulario. -->
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

    <form
      class="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm"
      (ngSubmit)="anotar()"
    >
      <h2 class="rotulo-seccion">Anotar un jugador</h2>

      <mat-button-toggle-group
        class="mt-3"
        aria-label="A quién se anota"
        hideSingleSelectionIndicator
        [value]="tipo()"
        (change)="tipo.set($event.value)"
      >
        @for (opcion of TIPOS; track opcion.valor) {
          <mat-button-toggle [value]="opcion.valor">
            {{ opcion.etiqueta }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>

      <div class="mt-3 flex flex-wrap items-end gap-3">
        @if (tipo() === 'socio') {
          <mat-form-field class="min-w-64 flex-1">
            <mat-label>Socio</mat-label>
            <mat-select name="socioId" [(ngModel)]="socioId">
              <mat-option [value]="0" disabled>Elige un socio</mat-option>
              @for (socio of sociosSinJugador(); track socio.id) {
                <mat-option [value]="socio.id">
                  {{ socio.numeroSocio }} · {{ socio.usuario.nombre }}
                  {{ socio.usuario.apellido }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        } @else {
          <mat-form-field class="flex-1">
            <mat-label>Nombre</mat-label>
            <input matInput name="nombre" [(ngModel)]="datos.nombre" />
          </mat-form-field>
          <mat-form-field class="flex-1">
            <mat-label>Apellido</mat-label>
            <input matInput name="apellido" [(ngModel)]="datos.apellido" />
          </mat-form-field>
          <mat-form-field class="flex-1">
            <mat-label>Teléfono</mat-label>
            <span matTextPrefix>+56&nbsp;</span>
            <input
              matInput
              appTelefono
              #telefono="ngModel"
              name="telefono"
              [(ngModel)]="datos.telefono"
            />
            <mat-error>{{ errorDelCampo(telefono.control) }}</mat-error>
          </mat-form-field>
        }

        <button
          matButton="filled"
          type="submit"
          [attr.aria-busy]="enCurso() === 'anotar'"
          [disabled]="trabajando()"
        >
          Anotar
        </button>
      </div>
    </form>

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
  protected readonly errorDelCampo = errorDelCampo;

  private readonly snackBar = inject(MatSnackBar);
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
    // Se lee en el formulario, que se ve aunque alguna de las dos no haya cargado.
    const conJugador = new Set(
      (this.jugadores.hasValue() ? this.jugadores.value() : [])
        .map((jugador) => jugador.socioId)
        .filter((id): id is number => id !== null),
    );

    return (this.socios.hasValue() ? this.socios.value().socios : []).filter(
      (socio) => !conJugador.has(socio.id),
    );
  });

  protected async anotar(): Promise<void> {
    const esSocio = this.tipo() === 'socio';

    await this.intentar('anotar', async () => {
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
      this.snackBar.open(
        `${jugador.nombre} ${jugador.apellido} ya puede jugar torneos.`,
        undefined,
        LO_HECHO,
      );
    });
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
      this.error.set(mensajeDelServidor(falla, 'No se pudo anotar al jugador.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}
