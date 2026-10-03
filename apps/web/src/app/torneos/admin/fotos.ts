import { Component, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Foto, Momento, Torneos } from '../torneos.service';

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
  imports: [FormsModule, Aviso],
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

      @if (fotos.value().length > 0) {
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
                type="button"
                class="boton boton-secundario boton-chico mt-1 w-full
                       border-destructive text-destructive"
                [disabled]="trabajando()"
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
        <label class="block">
          <span class="text-sm font-medium">Momento</span>
          <select class="campo mt-1" name="momento" [(ngModel)]="datos.momento">
            @for (tramo of tramos; track tramo.valor) {
              <option [value]="tramo.valor">{{ tramo.etiqueta }}</option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Pie de foto (opcional)</span>
          <input
            class="campo mt-1"
            name="descripcion"
            maxlength="200"
            placeholder="La entrega de premios"
            [(ngModel)]="datos.descripcion"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Archivo</span>
          <input
            class="campo mt-1"
            type="file"
            name="archivo"
            accept="image/jpeg,image/png"
            [disabled]="trabajando()"
            (change)="elegir($event)"
          />
        </label>

        <button
          type="submit"
          class="boton boton-secundario sm:col-span-3 sm:justify-self-start"
          [disabled]="trabajando() || !archivo()"
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

    await this.intentar(async () => {
      await this.api.subirFoto(this.torneoId(), archivo, {
        momento: this.datos.momento,
        descripcion: this.datos.descripcion.trim() || undefined,
      });
      this.datos = enBlanco();
      this.archivo.set(null);
    });
  }

  protected async quitar(foto: Foto): Promise<void> {
    await this.intentar(() => this.api.quitarFoto(this.torneoId(), foto.id));
  }

  private async intentar(accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);

    try {
      await accion();
    } catch (falla) {
      // El del servidor tal cual: dice si el archivo no era una imagen o si pesaba de
      // más, que son los dos motivos por los que esto falla de verdad.
      this.error.set(mensajeDelServidor(falla, 'No se pudo subir la foto.'));
    } finally {
      this.trabajando.set(false);
      this.version.update((veces) => veces + 1);
    }
  }
}
