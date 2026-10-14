import { Component, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { proveerCampos } from '../../ui/campos';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Foto, Momento, Torneos } from '../torneos.service';
import { Esqueleto } from '../../ui/esqueleto';

/** El formulario vacío. Función y no constante, para no compartir el objeto. */
const enBlanco = () => ({
  momento: 'DURANTE' as Momento,
  descripcion: '',
});

const TRAMOS: { valor: Momento; etiqueta: string }[] = [
  { valor: 'ANTES', etiqueta: 'Antes del torneo' },
  { valor: 'DURANTE', etiqueta: 'Durante el torneo' },
  { valor: 'DESPUES', etiqueta: 'Después del torneo' },
];

/**
 * Las fotos del torneo, desde el panel.
 *
 * **Se publican sin cuenta**, al revés que el comprobante de pago, y la pantalla lo
 * dice: quien sube una foto tiene que saber que va a quedar a la vista de cualquiera.
 *
 * La foto de un partido se cuelga desde el cuadro, con su número: acá se suben las
 * generales, que son casi todas.
 */
@Component({
  selector: 'app-fotos-del-torneo',
  imports: [
    MatSelectModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    Aviso,
    Esqueleto,
  ],
  providers: [proveerCampos()],
  template: `
    <section
      class="mt-4 rounded-xl border border-border bg-muted/30 p-4"
      aria-labelledby="titulo-fotos"
    >
      <h2 id="titulo-fotos" class="rotulo-seccion">Fotos</h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Se ven <strong>sin necesidad de tener cuenta</strong>. Al subirlas se les quitan
        los datos que traen adentro —entre ellos el lugar donde se sacaron— y se guardan
        en dos tamaños, para que la galería no gaste los datos de quien la abre en el
        club.
      </p>

      @if (fotos.error()) {
        <p class="mt-3 text-sm text-destructive">
          No se pudieron cargar las fotos. Reintenta en un momento.
        </p>
      } @else if (fotos.status() === 'loading') {
        <app-esqueleto class="mt-3 block" [filas]="2" etiqueta="Cargando las fotos…" />
      } @else if (fotos.value().length > 0) {
        <ul class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          @for (foto of fotos.value(); track foto.id) {
            <li class="relative">
              <img
                class="aspect-square w-full rounded-lg object-cover"
                [src]="foto.miniatura"
                [alt]="foto.descripcion ?? 'Foto del torneo'"
                loading="lazy"
              />
              <button
                matButton="outlined"
                type="button"
                class="peligro chico mt-1 w-full"
                [disabled]="trabajando()"
                [attr.aria-busy]="enCurso() === 'quitar-' + foto.id"
                (click)="quitar(foto)"
              >
                Quitar
                <span class="sr-only">
                  la foto {{ foto.descripcion ?? 'sin pie' }}
                </span>
              </button>
            </li>
          }
        </ul>
      }

      <form class="mt-3 grid gap-3 sm:grid-cols-3" (ngSubmit)="subir()">
        <mat-form-field>
          <mat-label>Momento</mat-label>
          <mat-select name="momento" [(ngModel)]="datos.momento">
            @for (tramo of tramos; track tramo.valor) {
              <mat-option [value]="tramo.valor">{{ tramo.etiqueta }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Pie de foto (opcional)</mat-label>
          <input
            matInput
            name="descripcion"
            maxlength="200"
            placeholder="La entrega de premios"
            [(ngModel)]="datos.descripcion"
          />
        </mat-form-field>

        <!-- Material no tiene campo de archivo, y matInput no admite type="file" (T247). -->
        <label class="block">
          <span class="text-sm font-medium">Archivo</span>
          <input
            class="mt-1 block w-full rounded-control border border-border bg-card p-3 text-sm"
            type="file"
            name="archivo"
            accept="image/jpeg,image/png"
            [disabled]="trabajando()"
            (change)="elegir($event)"
          />
        </label>

        <button
          matButton="outlined"
          type="submit"
          class="sm:col-span-3 sm:justify-self-start"
          [disabled]="trabajando() || !archivo()"
          [attr.aria-busy]="enCurso() === 'subir'"
        >
          {{ trabajando() ? 'Subiendo…' : 'Subir la foto' }}
        </button>
      </form>

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </section>
  `,
})
export class FotosDelTorneo {
  private readonly api = inject(Torneos);

  readonly torneoId = input.required<number>();

  protected readonly tramos = TRAMOS;
  protected datos = enBlanco();

  protected readonly archivo = signal<File | null>(null);
  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly fotos = resource({
    params: () => ({ id: this.torneoId(), version: this.version() }),
    loader: ({ params }) => this.api.fotos(params.id),
    defaultValue: [] as Foto[],
  });

  protected elegir(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;

    this.archivo.set(entrada.files?.[0] ?? null);
  }

  protected async subir(): Promise<void> {
    const archivo = this.archivo();

    if (!archivo) {
      this.error.set('Elige la foto antes de subirla.');
      return;
    }

    await this.intentar('subir', async () => {
      await this.api.subirFoto(this.torneoId(), archivo, {
        momento: this.datos.momento,
        descripcion: this.datos.descripcion.trim() || undefined,
      });
      this.datos = enBlanco();
      this.archivo.set(null);
    });
  }

  protected async quitar(foto: Foto): Promise<void> {
    await this.intentar(`quitar-${foto.id}`, () => this.api.quitarFoto(this.torneoId(), foto.id));
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
    } catch (falla) {
      // El del servidor tal cual: dice si el archivo no era una imagen o si pesaba de
      // más, que son los dos motivos por los que esto falla de verdad.
      this.error.set(mensajeDelServidor(falla, 'No se pudo subir la foto.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
      this.version.update((veces) => veces + 1);
    }
  }
}
