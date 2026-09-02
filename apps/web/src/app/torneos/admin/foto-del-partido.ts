import { Component, inject, input, output, signal } from '@angular/core';

import { mensajeDelServidor } from '../../core/errores';
import { Foto, Torneos } from '../torneos.service';

/**
 * La foto de **un partido**: casi siempre los dos jugadores antes de salir a la cancha.
 *
 * Componente propio y no un campo más en el formulario general: se sube desde el
 * partido, mirándolo en el cuadro, y sin este botón habría que elegir el número del
 * partido en una lista de dieciséis para colgar la foto que el club más va a subir.
 *
 * **No pide las fotos**: se las pasa el cuadro, que ya las trae todas en una sola
 * consulta. Un `resource` por partido serían dieciséis peticiones para dibujar un
 * cuadro.
 */
@Component({
  selector: 'app-foto-del-partido',
  template: `
    <div class="mt-1 flex flex-wrap items-center gap-2">
      @for (foto of fotos(); track foto.id) {
        <img
          class="size-10 rounded object-cover"
          [src]="foto.miniatura"
          [alt]="foto.descripcion ?? 'Foto del partido'"
          loading="lazy"
        />
      }

      <label class="text-xs text-muted-foreground">
        <span class="boton boton-texto boton-chico">
          {{ subiendo() ? 'Subiendo…' : 'Foto del partido' }}
        </span>
        <input
          class="sr-only"
          type="file"
          accept="image/jpeg,image/png"
          [disabled]="subiendo()"
          (change)="subir($event)"
        />
      </label>
    </div>

    @if (error(); as falla) {
      <p class="text-xs text-destructive">{{ falla }}</p>
    }
  `,
})
export class FotoDelPartido {
  private readonly api = inject(Torneos);

  readonly torneoId = input.required<number>();
  readonly partidoId = input.required<number>();
  readonly fotos = input.required<Foto[]>();

  /** Para que el cuadro vuelva a pedir las fotos: las tiene él, no este componente. */
  readonly subida = output<void>();

  protected readonly subiendo = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async subir(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];

    if (!archivo) return;

    this.error.set(null);
    this.subiendo.set(true);

    try {
      // **`ANTES` por omisión**: es la previa de los dos jugadores, que es para lo que
      // el club va a usar esto. El resto de los momentos se eligen en la galería del
      // torneo, donde hay espacio para un formulario entero.
      await this.api.subirFoto(this.torneoId(), archivo, {
        momento: 'ANTES',
        partidoId: this.partidoId(),
      });
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo subir la foto.'));
    } finally {
      this.subiendo.set(false);
      // Se limpia siempre: sin esto, elegir el mismo archivo otra vez no dispara
      // `change` y el segundo intento no haría nada visible.
      entrada.value = '';
      this.subida.emit();
    }
  }
}
