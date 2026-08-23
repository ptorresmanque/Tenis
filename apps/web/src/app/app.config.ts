import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
} from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    // La transición entre rutas la hace el navegador con la View Transitions API.
    // Cero dependencias de animación: @angular/animations está deprecado.
    //
    // Si ves dos `InvalidStateError: Transition was aborted because of invalid state`
    // por navegación, estás mirando la consola de un navegador con el documento oculto
    // (el pane de preview embebido corre siempre con `document.visibilityState === 'hidden'`).
    // La spec manda saltear la transición con ese error cuando el documento está oculto, y
    // el router loguea el rechazo de `ready`/`finished` solo en modo dev. En Chrome normal
    // la consola queda limpia y la transición anima 250ms. No es un bug: no lo "arregles".
    //
    // withComponentInputBinding: los parámetros de la URL llegan como inputs del
    // componente. Lo usa la página pública de la reserva para leer su token sin
    // inyectar el ActivatedRoute a mano.
    provideRouter(routes, withViewTransitions(), withComponentInputBinding()),
  ],
};
