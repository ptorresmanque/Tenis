import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * La raíz ya no dibuja nada: el encabezado, el pie y el salto al contenido viven
 * en los tres cascarones (`cascarones/`), porque el sitio público, el panel de
 * administración y las pantallas de sesión no comparten ninguno de los tres.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
