import { Component, computed, inject, input, resource } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { proveerCampos } from '../../ui/campos';
import { diaConAnioEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { TablaDeTour } from '../../ranking/tabla-de-tour';
import { Galeria } from '../../torneos/publico/galeria';
import { ESTADOS_TORNEO, EstadoTorneo, TorneoPublico } from '../../torneos/torneos.service';
import { Esqueleto } from '../../ui/esqueleto';
import { TablaDePuntos, TourPublico, Tours } from '../tours.service';

/** Las filas de la tabla, de la final hacia atrás. */
/** Una fila de la tabla de puntos: el resultado y cómo se llama. */
interface Resultado {
  clave: keyof TablaDePuntos;
  nombre: string;
}

const RESULTADOS: Resultado[] = [
  { clave: 'campeon', nombre: 'Campeón' },
  { clave: 'finalista', nombre: 'Finalista' },
  { clave: 'semifinal', nombre: 'Semifinal' },
  { clave: 'cuartos', nombre: 'Cuartos' },
  { clave: 'octavos', nombre: 'Octavos' },
  { clave: 'dieciseisavos', nombre: 'Dieciseisavos' },
  { clave: 'treintaidosavos', nombre: 'Treintaidosavos' },
];

/**
 * La página pública de un tour (T195 y T201, `SPEC-tours.md` § Pantallas): su imagen, su
 * descripción y, de la temporada elegida, cómo se suman los puntos, sus torneos y su
 * ranking; al final, su galería.
 *
 * **La temporada va en la dirección** (`?temporada=<id>`, y la categoría del ranking en
 * `?categoria=`), para que el enlace a la tabla de 2026 se pueda compartir; sin ella, la
 * vigente. **Las secciones sin contenido no
 * aparecen**: un tour recién creado muestra su nombre y nada más que prometa algo.
 */
@Component({
  selector: 'app-tour-publico',
  imports: [
    MatSelectModule,
    MatFormFieldModule,
    RouterLink,
    Galeria,
    Esqueleto,
    TablaDeTour,
    MatTableModule,
  ],
  providers: [proveerCampos()],
  template: `
    @if (tour.error()) {
      <section class="py-10">
        <h1 class="titular text-5xl">No encontramos ese tour</h1>
        <p class="mt-3 text-muted-foreground">
          Puede que el club lo haya quitado.
          <a routerLink="/tours" class="font-semibold text-primary underline"
            >Mira los tours del club</a
          >.
        </p>
      </section>
    } @else if (tour.isLoading() && !tour.hasValue()) {
      <app-esqueleto class="mt-4 block" [filas]="6" etiqueta="Cargando el tour…" />
    } @else if (tour.hasValue()) {
      @let suyo = tour.value();

      @if (suyo.imagen; as imagen) {
        <!-- Como la cabecera de Torneos: la foto a sangre, el velo y el titular encima. -->
        <section
          class="relative isolate -mx-4 overflow-hidden sm:mx-0 sm:rounded-region"
          aria-labelledby="titulo-tour"
        >
          <img
            class="aspect-[16/9] min-h-[18rem] w-full bg-muted object-cover"
            [src]="imagen.web"
            [alt]="'Imagen de ' + suyo.nombre"
            width="1600"
            height="900"
            fetchpriority="high"
          />
          <div class="absolute inset-0 velo-foto" aria-hidden="true"></div>
          <div class="absolute inset-0 flex items-end p-6 text-on-campo texto-sobre-foto sm:p-10">
            <h1 id="titulo-tour" class="titular text-5xl sm:text-7xl">{{ suyo.nombre }}</h1>
          </div>
        </section>
      } @else {
        <section
          class="-mx-4 bg-campo px-6 py-10 text-on-campo sm:mx-0 sm:rounded-region sm:px-10"
          aria-labelledby="titulo-tour"
        >
          <h1 id="titulo-tour" class="titular text-5xl sm:text-7xl">{{ suyo.nombre }}</h1>
        </section>
      }

      @if (suyo.descripcion) {
        <p data-descripcion class="mt-8 max-w-prose text-lg whitespace-pre-line">
          {{ suyo.descripcion }}
        </p>
      }

      @if (elegida(); as temporada) {
        <section class="mt-16 aparece-al-pasar" aria-labelledby="como-se-suman">
          <h2 id="como-se-suman" class="titular text-4xl sm:text-5xl">Cómo se suman los puntos</h2>

          <div class="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
            @if (suyo.temporadas.length > 1) {
              <mat-form-field>
                <mat-label>Temporada</mat-label>
                <mat-select [value]="temporada.id" (selectionChange)="elegir($event.value)">
                  @for (otra of suyo.temporadas; track otra.id) {
                    <mat-option [value]="otra.id">
                      {{ otra.nombre }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
            <p class="pb-2 text-muted-foreground">
              Temporada {{ temporada.nombre }}: del {{ enPalabras(temporada.fechaInicio) }} al
              {{ enPalabras(temporada.fechaFin) }}
            </p>
          </div>

          @if (temporada.niveles.length > 0) {
            <!-- Desplazable dentro de su caja: con cuatro niveles no cabe en 375 px, y la
                 página no puede desbordar de lado. -->
            <div class="mt-4 overflow-x-auto bg-card shadow-md">
              <table mat-table [attr.aria-label]="'Puntos por resultado en cada nivel de la temporada ' + temporada.nombre" [dataSource]="RESULTADOS">
                <ng-container matColumnDef="resultado">
                  <th mat-header-cell *matHeaderCellDef scope="col">Resultado</th>
                  <th
                    *matCellDef="let resultado"
                    scope="row"
                    class="mat-mdc-cell mdc-data-table__cell"
                  >
                    {{ resultado.nombre }}
                  </th>
                </ng-container>
                <!-- Una columna por nivel, en el orden de la temporada. -->
                @for (nivel of temporada.niveles; track nivel.id) {
                  <ng-container [matColumnDef]="'nivel-' + nivel.id">
                    <th mat-header-cell *matHeaderCellDef scope="col" class="text-end">
                      {{ nivel.nombre }}
                    </th>
                    <td
                      mat-cell
                      *matCellDef="let resultado"
                      class="text-end font-display text-lg font-bold tabular-nums"
                    >
                      {{ puntos(nivel.tabla, resultado) }}
                    </td>
                  </ng-container>
                }

                <tr mat-header-row *matHeaderRowDef="columnas(); sticky: true"></tr>
                <tr mat-row *matRowDef="let resultado; columns: columnas()"></tr>
              </table>
            </div>
            <p class="mt-3 max-w-prose text-sm text-muted-foreground">
              Cada torneo suma con el nivel que el club le dio en esta temporada. Pasar una ronda
              por bye no cuenta como jugarla, y quien termina con cero puntos no aparece en el
              ranking.
            </p>
          } @else {
            <p class="mt-4 text-muted-foreground">
              El club todavía no carga los niveles de esta temporada.
            </p>
          }
        </section>
      }

      <!-- Sus torneos y su ranking, de la temporada elegida (T201). Sin torneos, ninguna
           de las dos: un ranking vacío de una temporada que no empezó no dice nada. -->
      @if (elegida(); as temporada) {
        @if (torneos.error()) {
          <p class="mt-16 text-destructive">
            No se pudieron cargar los torneos de esta temporada. Reintenta en un momento.
          </p>
        } @else if (torneos.hasValue() && torneos.value().length > 0) {
          <section class="mt-16 aparece-al-pasar" aria-labelledby="torneos-de-la-temporada">
            <h2 id="torneos-de-la-temporada" class="titular text-4xl sm:text-5xl">
              Torneos de {{ temporada.nombre }}
            </h2>
            <ul class="mt-4 grid gap-3">
              @for (torneo of torneos.value(); track torneo.id) {
                <li class="bg-card p-4 shadow-md">
                  <a routerLink="/torneos" class="titulo-tarjeta text-primary hover:underline">
                    {{ torneo.nombre }}
                  </a>
                  <p class="mt-1 text-sm text-muted-foreground">
                    @if (nivelEn(torneo, temporada.id); as nivel) {
                      Nivel {{ nivel }} ·
                    }
                    del {{ enPalabras(torneo.fechaInicio) }} al {{ enPalabras(torneo.fechaFin) }} ·
                    {{ nombreEstado(torneo.estado) }}
                  </p>
                </li>
              }
            </ul>
          </section>

          <section class="mt-16 aparece-al-pasar" aria-labelledby="ranking-del-tour">
            <h2 id="ranking-del-tour" class="titular text-4xl sm:text-5xl">Ranking</h2>
            <!-- La misma tabla de /ranking, con el tour fijo. -->
            <app-tabla-de-tour
              [temporadaId]="temporada.id"
              [categoriaId]="categoriaElegida()"
              (categoria)="elegirCategoria(temporada.id, $event)"
            />
          </section>
        }
      }

      @if (suyo.fotos.length > 0) {
        <section class="mt-16 aparece-al-pasar" aria-labelledby="fotos-del-tour">
          <h2 id="fotos-del-tour" class="titular text-4xl sm:text-5xl">Fotos</h2>
          <app-galeria [fotos]="suyo.fotos" titulo="" [porOmision]="'Foto de ' + suyo.nombre" />
        </section>
      }
    }
  `,
})
export class TourPublicoPagina {
  private readonly api = inject(Tours);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  /** Llegan de la ruta por `withComponentInputBinding`: el id y `?temporada=`. */
  readonly id = input.required<string>();
  readonly temporada = input<string>();
  /** La categoría de juego del ranking (T201), o ninguna: la más alta con filas. */
  readonly categoria = input<string>();

  protected readonly RESULTADOS = RESULTADOS;
  protected readonly enPalabras = diaConAnioEnPalabras;

  protected readonly tour = resource({
    params: () => Number(this.id()),
    loader: ({ params }): Promise<TourPublico> => this.api.publico(params),
  });

  /** La de la dirección si es de este tour; si no, la vigente; si no, la primera. */
  protected readonly elegida = computed(() => {
    if (!this.tour.hasValue()) return null;

    const { temporadas, temporadaVigenteId } = this.tour.value();
    const pedida = Number(this.temporada());

    return (
      temporadas.find((t) => t.id === pedida) ??
      temporadas.find((t) => t.id === temporadaVigenteId) ??
      temporadas[0] ??
      null
    );
  });

  /** Lo que vale un resultado en un nivel. Método y no índice en la plantilla: la fila de
   *  mat-table llega sin tipo. */
  protected puntos(tabla: TablaDePuntos, resultado: Resultado): number {
    return tabla[resultado.clave];
  }

  /** Las columnas de la tabla de puntos: el resultado, y un nivel por columna. */
  protected readonly columnas = computed(() => [
    'resultado',
    ...(this.elegida()?.niveles ?? []).map((nivel) => `nivel-${nivel.id}`),
  ]);

  /** Los torneos de la temporada elegida, de cualquier año (T201). */
  protected readonly torneos = resource({
    params: () => this.elegida()?.id,
    loader: ({ params }) => this.api.torneosDeLaTemporada(params),
  });

  protected readonly categoriaElegida = computed(() => {
    const pedida = Number(this.categoria());

    return Number.isInteger(pedida) && pedida > 0 ? pedida : null;
  });

  /** El nivel con que el torneo suma en esta temporada: "500". */
  protected nivelEn(torneo: TorneoPublico, temporadaId: number): string | null {
    return torneo.tours.find((tour) => tour.temporadaId === temporadaId)?.nivel ?? null;
  }

  protected nombreEstado(estado: EstadoTorneo): string {
    return ESTADOS_TORNEO[estado];
  }

  /** La categoría va con su temporada, para que el enlace no dependa de la vigente. */
  protected elegirCategoria(temporada: number, categoria: number): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { temporada, categoria },
      replaceUrl: true,
    });
  }

  /** Cambia la dirección y no un estado suelto: el enlace copiado abre lo mismo. */
  protected elegir(temporada: number): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { temporada },
      replaceUrl: true,
    });
  }
}
