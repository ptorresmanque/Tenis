import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';

import { AdminCanchas, Lugar } from '../catalogo-canchas/admin/admin-canchas.service';
import { Club, FotoDelLugar } from '../club/club.service';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { Esqueleto } from '../ui/esqueleto';

/** Lo mismo que valida la API: es un bloque de una página, no una galería. */
const FOTOS_POR_LUGAR = 6;

const LUGARES: {
  lugar: Lugar;
  nombre: string;
  /** Para el lector de pantalla: «Archivo para la tienda». */
  conArticulo: string;
  porOmision: string;
  ejemplo: string;
}[] = [
  {
    lugar: 'TIENDA',
    nombre: 'Tienda',
    conArticulo: 'la tienda',
    porOmision: 'Foto de la tienda del club',
    ejemplo: 'La vitrina de raquetas',
  },
  {
    lugar: 'CAFETERIA',
    nombre: 'Cafetería',
    conArticulo: 'la cafetería',
    porOmision: 'Foto de la cafetería del club',
    ejemplo: 'La barra del café',
  },
  {
    lugar: 'GIMNASIO',
    nombre: 'Gimnasio',
    conArticulo: 'el gimnasio',
    porOmision: 'Foto del gimnasio del club',
    ejemplo: 'Las máquinas del gimnasio',
  },
];

/**
 * Las fotos de un lugar del club (T185), debajo de sus textos: cada pestaña, las suyas (T236).
 *
 * **Fuera del formulario de los textos**: cada lugar sube con su propio formulario, y un
 * formulario no puede ir dentro de otro. Lo que se sube o se borra se ve en el sitio sin
 * recargar, como lo que se guarda arriba.
 */
@Component({
  selector: 'app-fotos-del-club',
  imports: [MatButton, Aviso, Esqueleto],
  template: `
    <h2 class="rotulo-seccion mt-10">Fotos</h2>
    <p class="mt-2 max-w-prose text-sm text-muted-foreground">
      Hasta seis por lugar. Se ven <strong>sin necesidad de tener cuenta</strong>, y al
      subirlas se les quitan los datos que traen adentro, entre ellos el lugar donde se
      sacaron.
    </p>

    @if (fotos.error()) {
      <app-aviso variante="error" class="mt-3 block">
        No se pudieron cargar las fotos. Reintenta en un momento.
      </app-aviso>
    } @else if (fotos.isLoading() && !fotos.hasValue()) {
      <app-esqueleto class="mt-3 block" [filas]="2" etiqueta="Cargando las fotos…" />
    } @else {
      @for (uno of delLugar(); track uno.lugar) {
        <section class="mt-6 border-t border-border pt-4">
          <h3 class="font-display text-sm font-bold tracking-wide uppercase">
            {{ uno.nombre }}
          </h3>

          @let suyas = deLugar(uno.lugar);
          @if (suyas.length === 0) {
            <p class="mt-2 text-sm text-muted-foreground">Todavía no tiene fotos.</p>
          } @else {
            <p class="mt-2 text-sm text-muted-foreground">
              La primera es la de la portada. Para cambiarla, borra las de antes.
            </p>
            <ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              @for (foto of suyas; track foto.id) {
                <li>
                  <img
                    class="aspect-[4/3] w-full rounded-lg object-cover"
                    [src]="foto.miniatura"
                    [alt]="foto.descripcion ?? uno.porOmision"
                    loading="lazy"
                  />
                  @if (porBorrar() === foto.id) {
                    <!-- La confirmación en la foto, como al borrar una pregunta frecuente:
                         es la consecuencia de este botón y no hay foco que atrapar. -->
                    <div class="mt-2 flex flex-wrap gap-2">
                      <button
                        matButton="filled"
                        type="button"
                        class="peligro chico"
                        [disabled]="enCurso() !== null"
                        [attr.aria-busy]="enCurso() === 'borrar-' + foto.id"
                        (click)="borrar(uno.lugar, foto)"
                      >
                        Sí, borrar
                      </button>
                      <button
                        matButton
                        type="button"
                        class="chico"
                        (click)="porBorrar.set(null)"
                      >
                        Mejor no
                      </button>
                    </div>
                  } @else {
                    <button
                      matButton
                      type="button"
                      class="chico mt-2"
                      [disabled]="enCurso() !== null"
                      (click)="porBorrar.set(foto.id)"
                    >
                      Borrar
                      <span class="sr-only">{{ foto.descripcion ?? uno.porOmision }}</span>
                    </button>
                  }
                </li>
              }
            </ul>
          }

          @if (suyas.length >= FOTOS_POR_LUGAR) {
            <p class="mt-3 text-sm text-muted-foreground">
              Ya tiene seis fotos. Borra una para subir otra.
            </p>
          } @else {
            <form class="mt-4 grid gap-3 sm:grid-cols-2" (submit)="subir($event, uno.lugar)">
              <label class="block">
                <!-- Los dos formularios tienen los mismos campos: el lugar va en la
                     etiqueta para quien los recorre con un lector de pantalla. -->
                <span class="text-sm font-medium">
                  Archivo <span class="sr-only">para {{ uno.conArticulo }}</span>
                </span>
                <input
                  class="campo mt-1"
                  type="file"
                  accept="image/jpeg,image/png"
                  [disabled]="enCurso() !== null"
                  (change)="elegir(uno.lugar, $event)"
                />
              </label>

              <label class="block">
                <span class="text-sm font-medium">
                  Qué se ve en la foto <span class="sr-only">de {{ uno.conArticulo }}</span>
                  (opcional)
                </span>
                <input
                  class="campo mt-1"
                  type="text"
                  maxlength="200"
                  [placeholder]="uno.ejemplo"
                  [value]="textos()[uno.lugar]"
                  (input)="escribir(uno.lugar, $event)"
                />
              </label>

              <button
                matButton="outlined"
                type="submit"
                class="sm:col-span-2 sm:justify-self-start"
                [disabled]="enCurso() !== null || !archivos()[uno.lugar]"
                [attr.aria-busy]="enCurso() === 'subir-' + uno.lugar"
              >
                {{ enCurso() === 'subir-' + uno.lugar ? 'Subiendo…' : 'Subir la foto' }}
              </button>
            </form>
          }

          @if (fallas()[uno.lugar]; as falla) {
            <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
          }
        </section>
      }
    }
  `,
})
export class FotosDelClubPanel {
  private readonly api = inject(AdminCanchas);
  /** Los datos que lee el sitio público, para que muestre lo recién subido. */
  private readonly sitio = inject(Club);

  /** Cada pestaña muestra las de su lugar (T236). */
  readonly lugar = input.required<Lugar>();
  protected readonly delLugar = computed(() => LUGARES.filter((uno) => uno.lugar === this.lugar()));
  protected readonly FOTOS_POR_LUGAR = FOTOS_POR_LUGAR;

  protected readonly fotos = resource({ loader: () => this.api.fotosDelClub() });

  protected readonly archivos = signal<Record<Lugar, File | null>>({
    TIENDA: null,
    CAFETERIA: null,
    GIMNASIO: null,
  });
  protected readonly textos = signal<Record<Lugar, string>>({
    TIENDA: '',
    CAFETERIA: '',
    GIMNASIO: '',
  });
  /** El error va en el bloque del lugar que lo causó, no arriba de los dos. */
  protected readonly fallas = signal<Record<Lugar, string | null>>({
    TIENDA: null,
    CAFETERIA: null,
    GIMNASIO: null,
  });

  protected readonly porBorrar = signal<number | null>(null);
  /** Qué acción está viajando, para que gire su botón y no todos (T153). */
  protected readonly enCurso = signal<string | null>(null);

  protected deLugar(lugar: Lugar): FotoDelLugar[] {
    return this.fotos.hasValue() ? this.fotos.value()[lugar] : [];
  }

  protected elegir(lugar: Lugar, evento: Event): void {
    const archivo = (evento.target as HTMLInputElement).files?.[0] ?? null;

    this.archivos.update((actual) => ({ ...actual, [lugar]: archivo }));
  }

  protected escribir(lugar: Lugar, evento: Event): void {
    const texto = (evento.target as HTMLInputElement).value;

    this.textos.update((actual) => ({ ...actual, [lugar]: texto }));
  }

  protected async subir(evento: Event, lugar: Lugar): Promise<void> {
    evento.preventDefault();
    const archivo = this.archivos()[lugar];

    if (!archivo) return;

    await this.intentar(lugar, `subir-${lugar}`, async () => {
      await this.api.subirFotoDelClub(lugar, archivo, this.textos()[lugar].trim());
      this.archivos.update((actual) => ({ ...actual, [lugar]: null }));
      this.textos.update((actual) => ({ ...actual, [lugar]: '' }));
      (evento.target as HTMLFormElement).reset();
    });
  }

  protected async borrar(lugar: Lugar, foto: FotoDelLugar): Promise<void> {
    await this.intentar(lugar, `borrar-${foto.id}`, async () => {
      await this.api.quitarFotoDelClub(foto.id);
      this.porBorrar.set(null);
    });
  }

  private async intentar(lugar: Lugar, clave: string, accion: () => Promise<void>) {
    this.fallas.update((actual) => ({ ...actual, [lugar]: null }));
    this.enCurso.set(clave);

    try {
      await accion();
      this.fotos.reload();
      this.sitio.recargar();
    } catch (falla) {
      // El del servidor tal cual: dice si el archivo no era una imagen, si pesaba de más
      // o si el lugar ya tenía seis.
      this.fallas.update((actual) => ({
        ...actual,
        [lugar]: mensajeDelServidor(falla, 'No se pudo guardar la foto.'),
      }));
    } finally {
      this.enCurso.set(null);
    }
  }
}
