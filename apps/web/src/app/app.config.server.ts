import { FetchBackend } from '@angular/common/http';
import { ApplicationConfig, Injectable, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { Observable, throwError } from 'rxjs';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/**
 * **En el prerender no se llama a la API** (T360, SPEC-seo.md D1): al compilar no hay una API que
 * conteste, y lo que trajera quedaría congelado en el HTML hasta el próximo deploy. Toda petición
 * falla al tiro, sin red, y lo que la página muestra con datos va en `@defer`, que en el servidor
 * dibuja su esqueleto: los datos llegan en el navegador, como siempre.
 *
 * Es una subclase de `FetchBackend` y no otro `HttpBackend`: con otro, Angular avisa en
 * desarrollo que `HttpClient` no usa `fetch` (NG02801).
 */
@Injectable()
class SinApiEnElPrerender extends FetchBackend {
  override handle(): Observable<never> {
    return throwError(() => new Error('Sin API en el prerender'));
  }
}

/** La configuración del prerender (T360, SPEC-seo.md D2). */
const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: FetchBackend, useClass: SinApiEnElPrerender },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
