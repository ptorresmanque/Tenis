import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    // La transición entre rutas la hace el navegador con la View Transitions API.
    // Cero dependencias de animación: @angular/animations está deprecado.
    provideRouter(routes, withViewTransitions()),
  ],
};
