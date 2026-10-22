import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';

import { routes } from './app.routes';
import { Seo } from './seo/seo';
import { proveerMaterial } from './ui/material';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // El navegador reutiliza el HTML prerenderizado en vez de volver a dibujarlo (T360, D3). Trae
    // la hidratación incremental y la repetición de eventos: un clic antes de hidratar no se pierde.
    provideClientHydration(),
    provideHttpClient(withFetch()),
    // Las opciones de Angular Material para toda la web (T240).
    proveerMaterial(),
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
    //
    // withInMemoryScrolling: solo `anchorScrolling` (T186), para que «Ver las fotos» de la
    // portada lleve a la sección de la tienda en «El club» y no al comienzo de la página.
    // Actúa solo sobre URLs con `#`; el resto de la navegación queda como estaba.
    provideRouter(
      routes,
      withViewTransitions(),
      withComponentInputBinding(),
      withInMemoryScrolling({ anchorScrolling: 'enabled' }),
    ),
    // Con el título, la descripción, el canonical, el noindex y el Open Graph (T353).
    { provide: TitleStrategy, useExisting: Seo },
  ],
};
