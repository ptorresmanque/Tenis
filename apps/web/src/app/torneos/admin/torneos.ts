import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { diaEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { SUPERFICIES } from '../../catalogo-canchas/superficies';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import {
  CategoriaTorneo,
  ESTADOS_TORNEO,
  EstadoTorneo,
  Torneo,
  Torneos,
} from '../torneos.service';

/** El formulario vacío. Función y no constante, para no compartir el objeto. */
const enBlanco = () => ({
  nombre: '',
  categoriaId: 0,
  superficie: '' as string,
  fechaInicio: '',
  fechaFin: '',
  cierreInscripcion: '',
  cupo: 16,
});

/**
 * Los torneos del club y las categorías con que se puntúan.
 *
 * **La categoría es una fila y no un valor fijo del sistema** porque el club inventa
 * categorías: este año hay un "Máster de fin de año" que el año pasado no existía. Por
 * eso se administran acá y no en un archivo de configuración.
 */
@Component({
  selector: 'app-torneos',
  imports: [FormsModule, Aviso, EstadoVacio, Insignia],
  template: `
    <h1 class="font-display text-3xl font-bold">Torneos</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Los torneos del club y las categorías con que reparten puntos.
    </p>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }
    @if (aviso(); as texto) {
      <app-aviso variante="exito" class="mt-4 block">{{ texto }}</app-aviso>
    }

    @if (torneos.isLoading()) {
      <p class="mt-4 text-muted-foreground">Cargando…</p>
    } @else if (torneos.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="emoji_events"
        titulo="Todavía no hay torneos"
        detalle="Crea una categoría y después el primer torneo."
      />
    } @else {
      <ul class="mt-4 grid gap-3">
        @for (torneo of torneos.value(); track torneo.id) {
          <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p class="font-display text-lg font-semibold">{{ torneo.nombre }}</p>
              <app-insignia variante="info" icono="emoji_events">
                {{ torneo.categoria }}
              </app-insignia>
              <app-insignia
                [variante]="torneo.estado === 'INSCRIPCION' ? 'exito' : 'neutro'"
                icono="flag"
              >
                {{ nombreEstado(torneo.estado) }}
              </app-insignia>
            </div>

            <p class="mt-1 text-sm text-muted-foreground">
              {{ enPalabras(torneo.fechaInicio) }} — {{ enPalabras(torneo.fechaFin) }}
              · cupo {{ torneo.cupo }} · inscripción hasta
              {{ enPalabras(torneo.cierreInscripcion) }}
            </p>
            <p class="text-sm text-muted-foreground">
              El campeón se lleva {{ torneo.puntosCampeon }} puntos.
            </p>
          </li>
        }
      </ul>
    }

    <form
      class="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm"
      (ngSubmit)="crearTorneo()"
    >
      <h2 class="font-display text-lg font-semibold">Crear un torneo</h2>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="text-sm font-medium">Nombre</span>
          <input
            class="campo mt-1"
            name="nombre"
            placeholder="Copa de verano"
            [(ngModel)]="datos.nombre"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Categoría</span>
          <select class="campo mt-1" name="categoriaId" [(ngModel)]="datos.categoriaId">
            <option [value]="0" disabled>Elige una categoría</option>
            @for (categoria of categoriasActivas(); track categoria.id) {
              <option [value]="categoria.id">
                {{ categoria.nombre }} · {{ categoria.puntosCampeon }} puntos
              </option>
            }
          </select>
          @if (categoriasActivas().length === 0) {
            <span class="text-sm text-muted-foreground">
              Crea una categoría primero, abajo.
            </span>
          }
        </label>

        <label class="block">
          <span class="text-sm font-medium">Cupo del cuadro</span>
          <input
            class="campo mt-1"
            type="number"
            name="cupo"
            min="2"
            max="256"
            [(ngModel)]="datos.cupo"
          />
          <span class="text-sm text-muted-foreground">
            No hace falta que sea potencia de dos: el cuadro completa con byes.
          </span>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Empieza</span>
          <input
            class="campo mt-1"
            type="date"
            name="fechaInicio"
            [(ngModel)]="datos.fechaInicio"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Termina</span>
          <input
            class="campo mt-1"
            type="date"
            name="fechaFin"
            [(ngModel)]="datos.fechaFin"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Cierra la inscripción</span>
          <input
            class="campo mt-1"
            type="date"
            name="cierreInscripcion"
            [(ngModel)]="datos.cierreInscripcion"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Superficie</span>
          <select class="campo mt-1" name="superficie" [(ngModel)]="datos.superficie">
            <option value="">Sin definir</option>
            @for (superficie of superficies; track superficie[0]) {
              <option [value]="superficie[0]">{{ superficie[1] }}</option>
            }
          </select>
        </label>
      </div>

      <button type="submit" class="boton boton-primario mt-3" [disabled]="trabajando()">
        Crear torneo
      </button>
    </form>

    <h2 class="mt-8 font-display text-2xl font-bold">Categorías</h2>
    <p class="mt-1 max-w-prose text-muted-foreground">
      De los puntos del campeón salen los de cada ronda.
    </p>

    @if (categorias.value().length > 0) {
      <ul class="mt-3 grid gap-2">
        @for (categoria of categorias.value(); track categoria.id) {
          <li
            class="flex flex-wrap items-center gap-3 rounded-xl border border-border
                   bg-card p-3 shadow-sm"
          >
            <span class="font-medium" [class.line-through]="!categoria.activa">
              {{ categoria.nombre }}
            </span>
            <span class="text-sm text-muted-foreground">
              {{ categoria.puntosCampeon }} puntos al campeón
            </span>
            <button
              type="button"
              class="boton boton-texto boton-chico ms-auto"
              [disabled]="trabajando()"
              (click)="cambiarActividad(categoria)"
            >
              {{ categoria.activa ? 'Desactivar' : 'Reactivar' }}
            </button>
          </li>
        }
      </ul>
    }

    <form
      class="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border
             bg-card p-4 shadow-sm"
      (ngSubmit)="crearCategoria()"
    >
      <label class="flex-1">
        <span class="text-sm font-medium">Nombre de la categoría</span>
        <input
          class="campo mt-1"
          name="nombreCategoria"
          placeholder="Club 250"
          [(ngModel)]="categoriaNueva.nombre"
        />
      </label>
      <label class="flex-1">
        <span class="text-sm font-medium">Puntos al campeón</span>
        <input
          class="campo mt-1"
          type="number"
          name="puntosCampeon"
          min="1"
          [(ngModel)]="categoriaNueva.puntosCampeon"
        />
      </label>
      <button type="submit" class="boton boton-secundario" [disabled]="trabajando()">
        Agregar categoría
      </button>
    </form>
  `,
})
export class TorneosPanel {
  private readonly api = inject(Torneos);

  /** La lista compartida del catálogo: una copia acá sería la quinta. */
  protected readonly superficies = Object.entries(SUPERFICIES);

  protected datos = enBlanco();
  protected categoriaNueva = { nombre: '', puntosCampeon: 250 };

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly torneos = resource({
    params: () => this.version(),
    loader: () => this.api.torneos(),
    defaultValue: [] as Torneo[],
  });

  protected readonly categorias = resource({
    params: () => this.version(),
    loader: () => this.api.categorias(),
    defaultValue: [] as CategoriaTorneo[],
  });

  /** Solo las activas para crear: una desactivada es una que el club dejó de usar. */
  protected readonly categoriasActivas = computed(() =>
    this.categorias.value().filter((categoria) => categoria.activa),
  );

  protected readonly enPalabras = diaEnPalabras;

  protected nombreEstado(estado: EstadoTorneo): string {
    return ESTADOS_TORNEO[estado] ?? estado;
  }

  protected async crearTorneo(): Promise<void> {
    await this.intentar(async () => {
      const torneo = await this.api.crearTorneo({
        ...this.datos,
        categoriaId: Number(this.datos.categoriaId),
        cupo: Number(this.datos.cupo),
        superficie: this.datos.superficie || null,
      });

      this.datos = enBlanco();
      this.aviso.set(`${torneo.nombre} queda con la inscripción abierta.`);
    });
  }

  protected async crearCategoria(): Promise<void> {
    await this.intentar(async () => {
      await this.api.crearCategoria({
        nombre: this.categoriaNueva.nombre,
        puntosCampeon: Number(this.categoriaNueva.puntosCampeon),
      });

      this.categoriaNueva = { nombre: '', puntosCampeon: 250 };
    });
  }

  protected async cambiarActividad(categoria: CategoriaTorneo): Promise<void> {
    await this.intentar(() =>
      this.api.editarCategoria(categoria.id, { activa: !categoria.activa }),
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
      // El del servidor: dice si las fechas no cierran o si esa categoría ya existe.
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
