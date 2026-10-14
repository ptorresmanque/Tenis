import { Component, inject, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { diaConAnioEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { ESTADOS_PARTIDO, EstadoPartidoInterno } from '../ranking.service';
import { PartidoEnDisputa, RankingAdmin } from './partidos-internos.service';
import { Esqueleto } from '../../ui/esqueleto';

/**
 * Los partidos amistosos que el club puede tener que arreglar.
 *
 * **No hay tribunal que decida entre dos versiones**: alguien del club llama por
 * teléfono y lo resuelve. Lo que el sistema garantiza es que quede marcado, para que
 * una tabla que se movió por una llamada pueda explicarse.
 *
 * Abre en los rechazados porque son los que alguien reclama. Los pendientes no son
 * un problema del club: están esperando a su rival, y no caducan solos a propósito.
 */
@Component({
  selector: 'app-partidos-internos-panel',
  imports: [MatButtonToggleModule, MatButton, EstadoVacio, Insignia, Esqueleto],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: cada partido trae las suyas. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Partidos entre socios</h1>
        <p class="mt-1 text-muted-foreground">
          Los amistosos que un socio cargó y el rival no aceptó. Resolver acá deja el partido
          cerrado y marcado como resuelto por el club.
        </p>
      </div>
    </header>

    <!-- Un filtro es un grupo de opciones, no botones de acción (T251). -->
    <mat-button-toggle-group
      class="mt-4"
      aria-label="Filtrar partidos"
      hideSingleSelectionIndicator
      [value]="filtro()"
      (change)="filtro.set($event.value)"
    >
      @for (opcion of FILTROS; track opcion.valor) {
        <mat-button-toggle [value]="opcion.valor">{{ opcion.etiqueta }}</mat-button-toggle>
      }
    </mat-button-toggle-group>

    @if (partidos.error()) {
      <p class="mt-6 text-destructive">
        No se pudieron cargar los partidos. Reintenta en un momento.
      </p>
    } @else if (partidos.status() === 'loading') {
      <!-- Antes del vacío: el recurso arranca con la lista vacía, y mientras viajaba
           la consulta la pantalla decía que no había nada (T154). -->
      <app-esqueleto class="mt-4 block" [filas]="4" etiqueta="Cargando los partidos…" />
    } @else if (partidos.value().length === 0) {
      <app-estado-vacio
        class="mt-6 block"
        icono="handshake"
        titulo="No hay partidos en disputa"
        detalle="Cuando un socio rechace un partido que le cargaron, aparece acá."
      />
    } @else {
      <ul class="mt-4 grid gap-3">
        @for (partido of partidos.value(); track partido.id) {
          <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p class="titulo-tarjeta">{{ partido.socioA }} contra {{ partido.socioB }}</p>
              <app-insignia variante="neutro" icono="flag">
                {{ nombreEstado(partido.estado) }}
              </app-insignia>
              @if (partido.resueltoPorAdmin) {
                <app-insignia variante="info" icono="gavel"> Resuelto por el club </app-insignia>
              }
            </div>

            <!-- Dos redacciones y no una con el nombre metido dos veces: el caso
                 normal es que quien lo carga diga que ganó él, y ahí "lo cargó
                 Carolina diciendo que ganó Carolina" se lee como un error. -->
            <p class="mt-1 text-sm text-muted-foreground">
              {{ enPalabras(partido.jugadoEn) }} ·
              @if (partido.ganador === partido.socioA) {
                lo cargó {{ partido.socioA }}, que dice haber ganado
              } @else {
                lo cargó {{ partido.socioA }}, que dice que ganó
                {{ partido.ganador }}
              }
              @if (partido.marcador) {
                por {{ partido.marcador }}
              }
            </p>

            <div class="mt-3 flex flex-wrap gap-2">
              <button
                matButton="filled"
                type="button"
                class="chico"
                [disabled]="enviando()"
                [attr.aria-busy]="enCurso() === partido.id + '-CONFIRMADO'"
                (click)="resolver(partido.id, 'CONFIRMADO')"
              >
                Dar por jugado
              </button>
              <button
                matButton="outlined"
                type="button"
                class="chico"
                [disabled]="enviando()"
                [attr.aria-busy]="enCurso() === partido.id + '-RECHAZADO'"
                (click)="resolver(partido.id, 'RECHAZADO')"
              >
                Descartar
              </button>
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class PartidosInternosPanel {
  private readonly api = inject(RankingAdmin);

  protected readonly FILTROS = [
    { valor: 'RECHAZADO' as const, etiqueta: 'En disputa' },
    { valor: 'PENDIENTE' as const, etiqueta: 'Esperando al rival' },
    { valor: 'CONFIRMADO' as const, etiqueta: 'Confirmados' },
  ];

  /** Arranca en los rechazados: son los que alguien está reclamando. */
  protected readonly filtro = signal<EstadoPartidoInterno>('RECHAZADO');

  protected readonly partidos = resource({
    params: () => this.filtro(),
    loader: ({ params }) => this.api.partidosInternos(params),
    defaultValue: [] as PartidoEnDisputa[],
  });

  protected readonly enviando = signal(false);
  protected readonly enPalabras = diaConAnioEnPalabras;

  protected nombreEstado(estado: EstadoPartidoInterno): string {
    return ESTADOS_PARTIDO[estado] ?? estado;
  }

  /** Qué resolución está viajando, para que gire su botón y no el de al lado (T154). */
  protected readonly enCurso = signal<string | null>(null);

  protected async resolver(id: number, estado: EstadoPartidoInterno): Promise<void> {
    this.enviando.set(true);
    this.enCurso.set(`${id}-${estado}`);

    try {
      await this.api.resolver(id, estado);
      // Recargar y no pintar a mano: el estado lo decide el servidor, y una fila
      // que se pinta sola queda mintiendo si la petición no llegó.
      this.partidos.reload();
    } finally {
      this.enviando.set(false);
      this.enCurso.set(null);
    }
  }
}
