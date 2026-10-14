import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { proveerCampos } from '../ui/campos';
import { AdminCanchas, TextosDeElClub } from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { LO_HECHO } from '../ui/material';

/**
 * Cada texto con su etiqueta, para qué sirve y cuánto cabe. El largo es el de la columna:
 * `maxlength` no deja pasarlo, y la API recorta igual por si acaso.
 */
const TEXTOS = [
  {
    campo: 'elClubTitulo' as const,
    etiqueta: 'Título',
    ayuda: 'El titular grande sobre la foto.',
    largo: 80,
    lineas: 1,
  },
  {
    campo: 'elClubBajada' as const,
    etiqueta: 'Bajada',
    ayuda: 'La frase bajo el título. Si la dejas en blanco, no aparece.',
    largo: 300,
    lineas: 3,
  },
  {
    campo: 'elClubCanchas' as const,
    etiqueta: 'Texto de «Las canchas»',
    ayuda: 'El párrafo bajo el título «Las canchas». Si lo dejas en blanco, no aparece.',
    largo: 600,
    lineas: 4,
  },
];

/**
 * Los textos de la página "El club" (T142), que hasta ahora estaban escritos en la
 * plantilla.
 *
 * Sección aparte de "Datos del club" aunque vivan en la misma fila: escribir el titular
 * de una página es otra tarea que cargar el teléfono, y ese formulario ya tiene diez
 * campos. Lo que se guarda acá se ve en "El club" en la siguiente carga.
 */
@Component({
  selector: 'app-textos-del-sitio',
  imports: [MatFormFieldModule, MatInput, MatButton, FormsModule, Aviso],
  providers: [proveerCampos()],
  template: `
    <form class="grid max-w-xl gap-4" (ngSubmit)="guardar()">
      @if (configuracion.error()) {
        <app-aviso variante="error">
          No se pudieron cargar los textos. Reintenta en un momento.
        </app-aviso>
      }

      <fieldset class="grid gap-4">
        <legend class="font-display text-sm font-bold tracking-wide uppercase">
          La página «El club»
        </legend>

        @for (texto of TEXTOS; track texto.campo) {
          <!-- La cuenta va en la ayuda, que el lector lee al entrar al campo, y no en
               una región viva: esa hablaría con cada letra. -->
          <mat-form-field>
            <mat-label>
              {{ texto.etiqueta }}
              @if (texto.campo === 'elClubTitulo') {
                <span aria-hidden="true">*</span>
              }
            </mat-label>
            @if (texto.lineas === 1) {
              <input
                matInput
                [name]="texto.campo"
                [maxlength]="texto.largo"
                [ngModel]="formulario()[texto.campo]"
                (ngModelChange)="escribir(texto.campo, $event)"
              />
            } @else {
              <textarea
                matInput
                [name]="texto.campo"
                [rows]="texto.lineas"
                [maxlength]="texto.largo"
                [ngModel]="formulario()[texto.campo]"
                (ngModelChange)="escribir(texto.campo, $event)"
              ></textarea>
            }
            <mat-hint>{{ texto.ayuda + ' ' + quedan(texto.campo, texto.largo) }}</mat-hint>
          </mat-form-field>
        }
      </fieldset>

      @if (error(); as falla) {
        <app-aviso variante="error">{{ falla }}</app-aviso>
      }

      <div>
        <button
          matButton="filled"
          type="submit"
          [disabled]="guardando() || configuracion.isLoading() || !configuracion.hasValue()"
          [attr.aria-busy]="guardando()"
        >
          {{ guardando() ? 'Guardando…' : 'Guardar los textos' }}
        </button>
      </div>
    </form>
  `,
})
export class TextosDelSitio {
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(AdminCanchas);
  /** Los datos que lee el sitio público, para que muestre lo recién guardado. */
  private readonly sitio = inject(Club);

  protected readonly TEXTOS = TEXTOS;

  protected readonly configuracion = resource({
    loader: () => this.api.configuracion(),
  });

  /**
   * Lo que hay en los campos. Arranca de lo guardado y no se sincroniza después: si se
   * recargara solo, pisaría lo que la persona está escribiendo.
   */
  protected readonly editado = signal<Partial<TextosDeElClub>>({});

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected formulario(): TextosDeElClub {
    const guardados = this.configuracion.hasValue() ? this.configuracion.value() : undefined;

    return {
      elClubTitulo: this.editado().elClubTitulo ?? guardados?.elClubTitulo ?? '',
      elClubBajada: this.editado().elClubBajada ?? guardados?.elClubBajada ?? '',
      elClubCanchas: this.editado().elClubCanchas ?? guardados?.elClubCanchas ?? '',
    };
  }

  protected quedan(campo: keyof TextosDeElClub, largo: number): string {
    const quedan = largo - this.formulario()[campo].length;

    return quedan === 1 ? 'Queda 1 carácter.' : `Quedan ${quedan} caracteres.`;
  }

  protected escribir(campo: keyof TextosDeElClub, valor: string): void {
    this.editado.update((actual) => ({ ...actual, [campo]: valor }));
  }

  protected async guardar(): Promise<void> {
    this.error.set(null);

    if (!this.formulario().elClubTitulo.trim()) {
      // El servidor también lo rechaza; acá se dice sin gastar el viaje.
      this.error.set('El título no puede quedar vacío: es lo primero que se lee en «El club».');
      return;
    }

    this.guardando.set(true);

    try {
      await this.api.fijarTextosDeElClub(this.formulario());
      this.configuracion.reload();
      this.sitio.recargar();
      this.editado.set({});
      this.snackBar.open('Guardado. «El club» ya muestra estos textos.', undefined, LO_HECHO);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudieron guardar los textos.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
