import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  Contacto,
  Solicitud,
  TipoSolicitud,
} from '../../club/contacto.service';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { Selector } from '../../ui/selector';

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
  imports: [FormsModule, Aviso, EstadoVacio, Insignia, Selector],
  template: `
    <h1 class="font-display text-3xl font-bold">Consultas al club</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Lo que llega del formulario del sitio. Quien quiere asociarse se convierte en
      invitación desde acá.
    </p>

    <app-selector
      class="mt-4 block"
      etiqueta="Filtrar consultas"
      [opciones]="FILTROS"
      [(valor)]="filtro"
    />

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
      <p class="mt-4 text-muted-foreground">Cargando…</p>
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

            <h2 class="mt-2 font-display text-lg font-semibold">
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
                <a [href]="'tel:' + solicitud.telefono" class="underline">
                  {{ solicitud.telefono }}
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
                <label class="flex-1">
                  <span class="sr-only">Nota sobre {{ solicitud.nombre }}</span>
                  <input
                    class="campo campo-chico"
                    placeholder="Qué se hizo (opcional)"
                    [name]="'nota-' + solicitud.id"
                    [(ngModel)]="notas[solicitud.id]"
                  />
                </label>

                @if (solicitud.tipo === 'SOCIO' && !solicitud.invitacionId) {
                  <button
                    type="button"
                    class="boton boton-primario boton-chico"
                    [disabled]="trabajando()"
                    (click)="invitar(solicitud)"
                  >
                    Dar de alta como socio
                  </button>
                }

                <button
                  type="button"
                  class="boton boton-secundario boton-chico"
                  [disabled]="trabajando()"
                  (click)="resolver(solicitud, 'ATENDIDA')"
                >
                  Marcar atendida
                </button>
                <button
                  type="button"
                  class="boton boton-texto boton-chico"
                  [disabled]="trabajando()"
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
    await this.intentar(async () => {
      await this.api.resolver(solicitud.id, estado, this.notas[solicitud.id] ?? '');
      this.aviso.set(
        estado === 'ATENDIDA'
          ? `La consulta de ${solicitud.nombre} queda como atendida.`
          : `Descartaste la consulta de ${solicitud.nombre}.`,
      );
    });
  }

  protected async invitar(solicitud: Solicitud): Promise<void> {
    await this.intentar(async () => {
      await this.api.invitar(solicitud.id);
      this.aviso.set(
        `${solicitud.nombre} ya está invitada: le llega el alta a ${solicitud.email}.`,
      );
    });
  }

  private async intentar(accion: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: explica por qué una consulta de clases no se convierte en
      // socio, o que ese correo ya es socio del club.
      this.error.set(mensajeDelServidor(falla, 'No se pudo completar la acción.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
