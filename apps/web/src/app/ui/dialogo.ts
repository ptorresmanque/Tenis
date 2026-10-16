import { DestroyRef, effect, inject, Signal, TemplateRef, untracked } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';

/**
 * Un MatDialog que sigue a una señal (T252). Reemplaza al `<dialog>` nativo abierto con
 * `showModal()`: se abre cuando `abierto()` da true, y se cierre como se cierre —Escape, el
 * fondo, un botón con `mat-dialog-close`— avisa con `alCerrar`, que apaga la señal. Así todos
 * los caminos terminan en el mismo estado, como antes con el evento `close`.
 *
 * Un componente que es todo un diálogo lo abre con `abierto` siempre en true, y avisa a su
 * padre en `alCerrar`. Va en el constructor: necesita el contexto de inyección.
 */
export function dialogoSegun(
  abierto: () => boolean,
  plantilla: Signal<TemplateRef<unknown>>,
  alCerrar: () => void,
  opciones: MatDialogConfig = {},
): void {
  const dialogos = inject(MatDialog);
  let ref: MatDialogRef<unknown> | null = null;
  let destruido = false;

  effect(() => {
    const quiere = abierto();

    untracked(() => {
      if (quiere && !ref) {
        const nuevo = dialogos.open(plantilla(), opciones);
        ref = nuevo;
        nuevo.afterClosed().subscribe(() => {
          if (ref === nuevo) ref = null;
          // Si se cerró porque el componente se fue, ya no hay a quién avisar.
          if (!destruido) alCerrar();
        });
      } else if (!quiere && ref) {
        ref.close();
      }
    });
  });

  inject(DestroyRef).onDestroy(() => {
    destruido = true;
    ref?.close();
  });
}
