import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { proveerCampos } from '../../ui/campos';
import {
  Contacto,
  Solicitud,
  TipoSolicitud,
} from '../../club/contacto.service';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { EnlaceTelefonoPipe, TelefonoPipe } from '../../core/telefono';
import { Esqueleto } from '../../ui/esqueleto';

const TIPOS: Record<TipoSolicitud, string> = {
  SOCIO: 'Quiere asociarse',
  CLASES: 'Pregunta por clases',
  EMPRESA: 'Empresa o evento',
  OTRO: 'Otra cosa',
};

/**
 * La bandeja: quién le escribió al club y qué se hizo con cada consulta.
 *
 * **El número que el club necesita de acá no es cuántas llegaron, es cuántas
 * terminaron en un socio.** Por eso la de tipo "quiere asociarse" tiene su propio
 * botón, que crea la invitación con el correo ya puesto y deja las dos filas
 * enlazadas: es el circuito completo, y sin él nadie puede decir si tener sitio sirvió.
 */
@Component({
  selector: 'app-solicitudes',
  imports: [
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    Aviso,
    EstadoVacio,
    Insignia,
    MatButtonToggleModule,
    EnlaceTelefonoPipe,
    TelefonoPipe,
    Esqueleto,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: cada consulta trae las suyas. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Consultas al club</h1>
        <p class="mt-1 text-muted-foreground">
          Lo que llega del formulario del sitio. Quien quiere asociarse se convierte en
          invitación desde acá.
        </p>
      </div>
    </header>

    <mat-button-toggle-group
      class="mt-4"
      aria-label="Filtrar consultas"
      hideSingleSelectionIndicator
      [value]="filtro()"
      (change)="filtro.set($event.value)"
    >
      @for (opcion of FILTROS; track opcion.valor) {
        <mat-button-toggle [value]="opcion.valor">
          {{ opcion.etiqueta }}
        </mat-button-toggle>
      }
    </mat-button-toggle-group>

    <!-- Fuera del bloque de la lista: atender la última solicitud la saca de la
         bandeja, y con el aviso adentro el admin veía desaparecer la fila sin ninguna
         confirmación de lo que acababa de hacer. Justo en la acción que da de alta a
         un socio. -->
    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }
    @if (aviso(); as texto) {
      <app-aviso variante="exito" class="mt-4 block">{{ texto }}</app-aviso>
    }

    @if (solicitudes.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="4" etiqueta="Cargando las solicitudes…" />
    } @else if (solicitudes.error()) {
      <p class="mt-4 text-destructive">
        No se pudieron cargar las solicitudes. Reintenta en un momento.
      </p>
    } @else if (solicitudes.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="drafts"
        titulo="Nada por responder"
        detalle="Cuando alguien escriba desde el sitio, aparece acá."
      />
    } @else {
      <ul class="mt-4 grid gap-3">
        @for (solicitud of solicitudes.value(); track solicitud.id) {
          <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div class="flex flex-wrap items-center gap-2">
              <app-insignia
                [variante]="solicitud.tipo === 'SOCIO' ? 'info' : 'neutro'"
                icono="mail"
              >
                {{ nombreTipo(solicitud.tipo) }}
              </app-insignia>

              @if (solicitud.estado === 'ATENDIDA') {
                <app-insignia variante="exito" icono="check">Atendida</app-insignia>
              } @else if (solicitud.estado === 'DESCARTADA') {
                <app-insignia variante="neutro" icono="block">Descartada</app-insignia>
              }

              <span class="ms-auto text-sm text-muted-foreground">
                {{ cuando(solicitud.creadaEn) }}
              </span>
            </div>

            <h2 class="mt-2 titulo-tarjeta">
              {{ solicitud.nombre }}
            </h2>
            <p class="text-sm text-muted-foreground">
              @if (solicitud.email) {
                <a [href]="'mailto:' + solicitud.email" class="underline">
                  {{ solicitud.email }}
                </a>
              }
              @if (solicitud.email && solicitud.telefono) {
                ·
              }
              @if (solicitud.telefono) {
                <a [href]="solicitud.telefono | enlaceTelefono" class="underline">
                  {{ solicitud.telefono | telefono }}
                </a>
              }
            </p>

            @if (solicitud.mensaje) {
              <p class="mt-2 text-sm">{{ solicitud.mensaje }}</p>
            }

            @if (solicitud.nota) {
              <p class="mt-2 rounded-lg bg-muted p-2 text-sm">
                <span class="font-medium">Nota:</span> {{ solicitud.nota }}
              </p>
            }

            @if (solicitud.estado === 'NUEVA') {
              <div class="mt-3 flex flex-wrap items-end gap-2">
                <mat-form-field class="chico flex-1">
                  <!-- Sin etiqueta a la vista, como antes: la fila ya dice de quién es. -->
                  <input
                    matInput
                    [attr.aria-label]="'Nota sobre ' + solicitud.nombre"
                    placeholder="Qué se hizo (opcional)"
                    [name]="'nota-' + solicitud.id"
                    [(ngModel)]="notas[solicitud.id]"
                  />
                </mat-form-field>

                @if (solicitud.tipo === 'SOCIO' && !solicitud.invitacionId) {
                  <button
                    matButton="filled"
                    type="button"
                    class="chico"
                    [disabled]="trabajando()"
                    [attr.aria-busy]="enCurso() === 'invitar-' + solicitud.id"
                    (click)="invitar(solicitud)"
                  >
                    Dar de alta como socio
                  </button>
                }

                <button
                  matButton="outlined"
                  type="button"
                  class="chico"
                  [disabled]="trabajando()"
                  [attr.aria-busy]="enCurso() === 'resolver-' + solicitud.id + '-' + 'ATENDIDA'"
                  (click)="resolver(solicitud, 'ATENDIDA')"
                >
                  Marcar atendida
                </button>
                <button
                  matButton
                  type="button"
                  class="chico"
                  [disabled]="trabajando()"
                  [attr.aria-busy]="enCurso() === 'resolver-' + solicitud.id + '-' + 'DESCARTADA'"
                  (click)="resolver(solicitud, 'DESCARTADA')"
                >
                  Descartar
                </button>
              </div>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class SolicitudesPanel {
  private readonly api = inject(Contacto);

  protected readonly FILTROS = [
    { valor: 'NUEVA', etiqueta: 'Por responder' },
    { valor: 'ATENDIDA', etiqueta: 'Atendidas' },
    { valor: 'todas', etiqueta: 'Todas' },
  ];

  /** Arranca en las nuevas: es lo que alguien viene a hacer a esta pantalla. */
  protected readonly filtro = signal('NUEVA');
  protected readonly notas: Record<number, string> = {};

  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly solicitudes = resource({
    params: () => ({ estado: this.filtro(), version: this.version() }),
    loader: ({ params }) =>
      this.api.bandeja(params.estado === 'todas' ? {} : { estado: params.estado }),
    defaultValue: [],
  });

  protected nombreTipo(tipo: TipoSolicitud): string {
    return TIPOS[tipo] ?? tipo;
  }

  protected cuando(instante: string): string {
    return new Date(instante).toLocaleDateString('es-CL', {
      timeZone: 'America/Santiago',
      dateStyle: 'medium',
    });
  }

  protected async resolver(
    solicitud: Solicitud,
    estado: 'ATENDIDA' | 'DESCARTADA',
  ): Promise<void> {
    await this.intentar(`resolver-${solicitud.id}-${estado}`, async () => {
      await this.api.resolver(solicitud.id, estado, this.notas[solicitud.id] ?? '');
      this.aviso.set(
        estado === 'ATENDIDA'
          ? `La consulta de ${solicitud.nombre} queda como atendida.`
          : `Descartaste la consulta de ${solicitud.nombre}.`,
      );
    });
  }

  protected async invitar(solicitud: Solicitud): Promise<void> {
    await this.intentar(`invitar-${solicitud.id}`, async () => {
      await this.api.invitar(solicitud.id);
      this.aviso.set(
        `${solicitud.nombre} ya está invitada: le llega el alta a ${solicitud.email}.`,
      );
    });
  }

  private async intentar(
    clave: string,
    accion: () => Promise<void>,
  ): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: explica por qué una consulta de clases no se convierte en
      // socio, o que ese correo ya es socio del club.
      this.error.set(mensajeDelServidor(falla, 'No se pudo completar la acción.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}
