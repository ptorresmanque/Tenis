import {
  Component,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCard } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { proveerCampos } from '../../ui/campos';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { FichaDeTour, FotoDeTour, Tours } from '../tours.service';

/**
 * La pestaña Galería de la ficha de un tour (T193): subir fotos con su pie, corregirlo y
 * borrarlas. El mismo trato que las fotos de un torneo en el panel, sin el selector de
 * momento: las del tour no tienen un antes ni un después.
 *
 * **Se publican sin cuenta**, y la pantalla lo dice: quien sube una foto tiene que saber
 * que queda a la vista de cualquiera.
 */
@Component({
  selector: 'app-galeria-del-tour',
  imports: [MatCard, MatFormFieldModule, MatInput, MatButton, FormsModule, Aviso],
  providers: [proveerCampos()],
  template: `
    <form
      class="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm"
      aria-label="Subir una foto"
      (ngSubmit)="subir()"
    >
      <h2 class="rotulo-seccion">Subir una foto</h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Se ven <strong>sin necesidad de tener cuenta</strong>. Al subirlas se les quitan los datos
        que traen adentro, entre ellos el lugar donde se sacaron.
      </p>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <!-- Material no tiene campo de archivo, y matInput no admite type="file" (T247). -->
        <label class="block">
          <span class="text-sm font-medium">Archivo</span>
          <input
            class="mt-1 block w-full rounded-control border border-border bg-card p-3 text-sm"
            #entradaArchivo
            type="file"
            accept="image/jpeg,image/png"
            [disabled]="enCurso() !== null"
            (change)="elegir($event)"
          />
        </label>
        <mat-form-field>
          <mat-label>Pie de foto (opcional)</mat-label>
          <input
            matInput
            name="pie"
            maxlength="200"
            placeholder="La premiación de 2027"
            [(ngModel)]="pie"
          />
        </mat-form-field>
      </div>
      <button
        matButton="outlined"
        type="submit"
        class="mt-3"
        [disabled]="enCurso() !== null || !archivo()"
        [attr.aria-busy]="enCurso() === 'subir'"
      >
        {{ enCurso() === 'subir' ? 'Subiendo…' : 'Subir la foto' }}
      </button>
      @if (origen() === 'subir' && error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </form>

    @if (tour().fotos.length === 0) {
      <p class="mt-6 text-muted-foreground">
        Todavía no tiene fotos. La premiación de la temporada o el afiche del tour son buenas
        primeras.
      </p>
    } @else {
      <ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (foto of tour().fotos; track foto.id; let i = $index, total = $count) {
          <li>
            <mat-card appearance="outlined" class="p-3">
              <img
                class="aspect-[4/3] w-full bg-muted object-cover"
                [src]="foto.miniatura"
                [alt]="foto.descripcion ?? 'Foto de ' + tour().nombre"
                loading="lazy"
              />
              <!-- La posición, para el lector de pantalla: el mismo «Pie de foto» repetido
                     en cada fila no dice de cuál es. -->
              <mat-form-field>
                <mat-label>
                  Pie de foto <span class="sr-only">(foto {{ i + 1 }} de {{ total }})</span>
                </mat-label>
                <input
                  matInput
                  maxlength="200"
                  [ngModel]="pies()[foto.id] ?? ''"
                  (ngModelChange)="escribirPie(foto.id, $event)"
                />
              </mat-form-field>

              @if (porBorrar() === foto.id) {
                <!-- La confirmación en la foto, como en las fotos de la tienda. -->
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    matButton="filled"
                    type="button"
                    class="peligro chico"
                    [disabled]="enCurso() !== null"
                    [attr.aria-busy]="enCurso() === 'borrar-' + foto.id"
                    (click)="borrar(foto)"
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
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    matButton="outlined"
                    type="button"
                    class="chico"
                    [disabled]="enCurso() !== null"
                    [attr.aria-busy]="enCurso() === 'pie-' + foto.id"
                    (click)="guardarPie(foto)"
                  >
                    Guardar el pie
                  </button>
                  <button
                    matButton
                    type="button"
                    class="chico"
                    (click)="porBorrar.set(foto.id)"
                  >
                    Borrar
                    <span class="sr-only">la foto {{ i + 1 }} de {{ total }}</span>
                  </button>
                </div>
              }

              @if (origen() === foto.id && error(); as falla) {
                <app-aviso variante="error" class="mt-2 block">{{ falla }}</app-aviso>
              }
            </mat-card>
          </li>
        }
      </ul>
    }
  `,
})
export class GaleriaDelTour {
  private readonly api = inject(Tours);

  readonly tour = input.required<FichaDeTour>();

  /** Algo cambió en la API: la ficha tiene que recargar. */
  readonly cambio = output<void>();

  protected readonly archivo = signal<File | null>(null);
  protected pie = '';
  private readonly entradaArchivo =
    viewChild.required<ElementRef<HTMLInputElement>>('entradaArchivo');

  /** Lo que hay en el pie de cada foto; vuelve a lo guardado cuando la ficha recarga. */
  protected readonly pies = linkedSignal<Record<number, string>>(() =>
    Object.fromEntries(this.tour().fotos.map((foto) => [foto.id, foto.descripcion ?? ''])),
  );

  protected readonly porBorrar = signal<number | null>(null);
  /** Qué acción está viajando, para que gire su botón y no todos (T153). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  /** Dónde va el error: junto al formulario de subir o junto a la foto que lo causó. */
  protected readonly origen = signal<'subir' | number | null>(null);

  protected elegir(evento: Event): void {
    this.archivo.set((evento.target as HTMLInputElement).files?.[0] ?? null);
  }

  protected escribirPie(id: number, texto: string): void {
    this.pies.update((actuales) => ({ ...actuales, [id]: texto }));
  }

  protected async subir(): Promise<void> {
    const archivo = this.archivo();
    if (!archivo) return;

    const listo = await this.intentar('subir', 'subir', () =>
      this.api.subirFoto(this.tour().id, archivo, this.pie.trim()),
    );

    if (listo) {
      this.archivo.set(null);
      this.pie = '';
      // Si no, el campo sigue mostrando el nombre de la que ya se subió.
      this.entradaArchivo().nativeElement.value = '';
    }
  }

  protected async guardarPie(foto: FotoDeTour): Promise<void> {
    await this.intentar(foto.id, `pie-${foto.id}`, () =>
      this.api.corregirPie(foto.id, (this.pies()[foto.id] ?? '').trim()),
    );
  }

  protected async borrar(foto: FotoDeTour): Promise<void> {
    await this.intentar(foto.id, `borrar-${foto.id}`, () => this.api.quitarFoto(foto.id));
    this.porBorrar.set(null);
  }

  /** Corre la acción, avisa a la ficha si salió bien y dice si salió bien. */
  private async intentar(
    origen: 'subir' | number,
    clave: string,
    accion: () => Promise<unknown>,
  ): Promise<boolean> {
    this.error.set(null);
    this.origen.set(origen);
    this.enCurso.set(clave);

    try {
      await accion();
      this.cambio.emit();
      return true;
    } catch (falla) {
      // El del servidor tal cual: dice si el archivo no era una imagen o si pesaba de más.
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar la foto.'));
      return false;
    } finally {
      this.enCurso.set(null);
    }
  }
}
