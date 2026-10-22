import { Component, computed, inject, input, resource } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { proveerCampos } from '../ui/campos';
import { Auth } from '../core/auth/auth';
import { Tours } from '../tours/tours.service';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { TablaDeTour } from './tabla-de-tour';
import { TablaInterna } from './tabla-interna';

/**
 * `/ranking`: la tabla de un tour, una temporada y una categoría de juego (T200,
 * `SPEC-ranking.md` § La pantalla).
 *
 * **Los tres van en la dirección** (`?tour=&temporada=&categoria=`), para que el enlace
 * a la tabla de la 4ª de 2027 se pueda compartir. Sin ellos: el primer tour por nombre,
 * su temporada vigente (o la más nueva) y la categoría más alta con filas, que la elige
 * el servidor.
 */
@Component({
  selector: 'app-ranking-torneos',
  imports: [MatSelectModule, MatFormFieldModule, EstadoVacio, Esqueleto, TablaDeTour, TablaInterna],
  providers: [proveerCampos()],
  template: `
    <!-- Cabecera en banda de color y sin fotografía: esta pantalla es una tabla
         de posiciones, y lo que se viene a hacer acá es buscar un nombre en una
         lista. Una foto grande arriba solo alejaría la primera fila. -->
    <section
      class="a-sangre bg-campo px-sangre-4 py-8 text-on-campo sm:px-sangre-8"
      aria-labelledby="ranking"
    >
      <h1 id="ranking" class="titular text-5xl sm:text-7xl">Ranking de torneos</h1>
      <p class="mt-2 max-w-prose text-on-campo/90">
        Una tabla por tour, temporada y categoría: los puntos de cada jugador según hasta dónde
        llegó en cada torneo.
      </p>
    </section>

    <!-- Lo que viene de la API va en @defer (T363, SPEC-seo.md D1): el HTML del build
         trae el esqueleto, no un error de carga. -->
    @defer (on immediate) {
      @if (tours.error()) {
        <p class="mt-6 text-destructive">No se pudo cargar el ranking. Reintenta en un momento.</p>
      } @else if (tours.isLoading()) {
        <app-esqueleto class="mt-6 block" [filas]="6" etiqueta="Cargando el ranking…" />
      } @else if (tours.value().length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="military_tech"
          titulo="Todavía no hay tours"
          detalle="Cuando el club arme el primero, su ranking aparece acá."
        />
      } @else {
        <!-- Tour y temporada; la categoría la pone la tabla, que es la que sabe cuáles
             tienen resultados. Los tres van en la dirección. -->
        <div class="mt-6 flex flex-wrap items-end gap-4">
          <mat-form-field>
            <mat-label>Tour</mat-label>
            <mat-select
              [value]="tourElegido()?.id"
              name="tour"
              (selectionChange)="elegirTour($event.value)"
            >
              @for (uno of tours.value(); track uno.id) {
                <mat-option [value]="uno.id">
                  {{ uno.nombre }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          @if (temporadas().length > 0) {
            <mat-form-field>
              <mat-label>Temporada</mat-label>
              <mat-select
                [value]="temporadaElegida()"
                name="temporada"
                (selectionChange)="elegirTemporada($event.value)"
              >
                @for (una of temporadas(); track una.id) {
                  <mat-option [value]="una.id">
                    {{ una.nombre }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
        </div>

        @if (temporadaElegida(); as temporadaId) {
          <app-tabla-de-tour
            [temporadaId]="temporadaId"
            [categoriaId]="categoriaElegida()"
            (categoria)="elegirCategoria($event)"
          />
        } @else if (tourDetalle.error()) {
          <p class="mt-6 text-destructive">No se pudo cargar el tour. Reintenta en un momento.</p>
        } @else if (tourDetalle.hasValue()) {
          <p class="mt-6 text-muted-foreground">Este tour todavía no tiene temporadas.</p>
        }
      }
    } @placeholder {
      <app-esqueleto class="mt-6 block" [filas]="6" etiqueta="Cargando el ranking…" />
    }

    <!-- La tabla del club solo para socios: el endpoint la niega a los demás, y una
         sección que carga un 403 es peor que una que no está. Las dos comparten
         pantalla porque comparten vocabulario, pero no comparten público. -->
    @if (esSocio()) {
      <section class="mt-12 aparece-al-pasar">
        <h2 class="titular text-4xl sm:text-5xl">Tabla del club</h2>
        <p class="mt-1 max-w-prose text-muted-foreground">
          El orden de juego entre socios, con los amistosos que ustedes mismos cargan.
        </p>
        <app-tabla-interna />
      </section>
    }
  `,
})
export class RankingDeTorneos {
  private readonly api = inject(Tours);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  /** Llegan de la dirección por `withComponentInputBinding`. */
  readonly tour = input<string>();
  readonly temporada = input<string>();
  readonly categoria = input<string>();

  protected readonly tours = resource({
    loader: () => this.api.publicos(),
    defaultValue: [],
  });

  /** El de la dirección si existe; si no, el primero por nombre. */
  protected readonly tourElegido = computed(() => {
    const lista = this.tours.hasValue() ? this.tours.value() : [];

    return lista.find((uno) => uno.id === Number(this.tour())) ?? lista[0] ?? null;
  });

  /** Las temporadas y la vigente vienen en la página del tour. */
  protected readonly tourDetalle = resource({
    params: () => this.tourElegido()?.id,
    loader: ({ params }) => this.api.publico(params),
  });

  protected readonly temporadas = computed(() =>
    this.tourDetalle.hasValue() ? this.tourDetalle.value().temporadas : [],
  );

  /** La de la dirección si es de este tour; si no, la vigente; si no, la más nueva. */
  protected readonly temporadaElegida = computed(() => {
    if (!this.tourDetalle.hasValue()) return null;

    const { temporadas, temporadaVigenteId } = this.tourDetalle.value();
    const pedida = temporadas.find((una) => una.id === Number(this.temporada()));

    return pedida?.id ?? temporadaVigenteId ?? temporadas[0]?.id ?? null;
  });

  /** La de la dirección, o nula: la tabla pide la más alta con filas. */
  protected readonly categoriaElegida = computed(() => {
    const pedida = Number(this.categoria());

    return Number.isInteger(pedida) && pedida > 0 ? pedida : null;
  });

  /** La temporada es de un tour: cambiar de tour la suelta, y la categoría con ella. */
  protected elegirTour(valor: number): void {
    this.irA({ tour: valor, temporada: null, categoria: null });
  }

  /** La categoría se suelta: la más alta con filas puede ser otra en otra temporada. */
  protected elegirTemporada(valor: number): void {
    this.irA({
      tour: this.tourElegido()?.id ?? null,
      temporada: valor,
      categoria: null,
    });
  }

  /**
   * **Los tres en la dirección**, también el tour y la temporada que salieron por
   * omisión: con solo `?categoria=`, el enlace de hoy abriría otra temporada cuando cambie
   * la vigente.
   */
  protected elegirCategoria(categoria: number): void {
    this.irA({
      tour: this.tourElegido()?.id ?? null,
      temporada: this.temporadaElegida(),
      categoria,
    });
  }

  /** Cambia la dirección y no un estado suelto: el enlace copiado abre lo mismo. */
  private irA(queryParams: Record<string, number | null>): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private readonly sesion = inject(Auth);
  protected readonly esSocio = computed(() => this.sesion.usuario()?.socioId != null);
}
