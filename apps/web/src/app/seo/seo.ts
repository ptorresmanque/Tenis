import { DOCUMENT } from '@angular/common';
import { inject, Service } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  PRIMARY_OUTLET,
  RouterStateSnapshot,
  TitleStrategy,
} from '@angular/router';

/**
 * El dominio del sitio. El canonical y el Open Graph apuntan acá también desde QA, que ya está
 * fuera del índice por su `X-Robots-Tag` (SPEC-seo.md A6).
 */
const ORIGEN = 'https://fedal.cl';

/** La de `index.html`, para las rutas que no traen la suya. */
export const DESCRIPCION_DEL_SITIO =
  'Reserva tu cancha de tenis en Temuco en línea: canchas techadas y con luz, clases, torneos ' +
  'y ranking. Para socios y visitantes.';

/**
 * Lo que cada ruta le dice al buscador (T353, SPEC-seo.md): el título, la descripción, el
 * canonical, el `noindex` y el Open Graph.
 *
 * **Es el `TitleStrategy` de la web, y no un servicio aparte que escuche al router.** Angular lo
 * llama cuando la navegación termina, con toda la cadena de la ruta a mano; un `NavigationEnd`
 * llega antes de que el título cambie, y el `og:title` saldría con el de la página anterior.
 *
 * Se lee del `data` de cada ruta de la cadena, del cascarón a la página: la descripción, la más
 * profunda que haya; `indexar: false` en cualquier punto basta, así el panel o Mi cuenta lo ponen
 * una vez en el padre y una pantalla nueva nace fuera del índice (A4).
 */
@Service()
export class Seo extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly documento = inject(DOCUMENT);

  /** La URL de la última navegación, sin la consulta. */
  private url = '';
  /** Lo que la página puso encima de su ruta con `aplicar()`, y en qué URL. */
  private propio: { url: string; titulo: string; descripcion: string } | null = null;

  override updateTitle(estado: RouterStateSnapshot): void {
    const cadena = cadenaDe(estado.root);
    // Los segmentos y nada más: sin la consulta ni el ancla. Los ~45 enlaces que la portada arma
    // a `/disponibilidad?fecha=…` cada día son, para el buscador, una sola página (A6).
    const url = `${ORIGEN}/${cadena.flatMap((ruta) => ruta.url.map((s) => s.path)).join('/')}`;

    // Lo que puso la página sigue mientras no se cambie de página: elegir otra temporada del tour
    // cambia solo la consulta, y el router vuelve a pasar por acá con el título de la ruta.
    if (this.propio?.url !== url) this.propio = null;
    this.url = url;

    const titulo = this.propio?.titulo ?? this.buildTitle(estado);
    if (titulo !== undefined) this.title.setTitle(titulo);

    const descripcion: string =
      this.propio?.descripcion ??
      [...cadena].reverse().find((ruta) => ruta.data['descripcion'])?.data['descripcion'] ??
      DESCRIPCION_DEL_SITIO;
    const indexar = cadena.every((ruta) => ruta.data['indexar'] !== false);

    this.meta.updateTag({ name: 'description', content: descripcion });
    // Sin canonical en lo que no se indexa: las dos señales juntas se contradicen.
    this.canonical(indexar ? url : null);
    if (indexar) this.meta.removeTag('name="robots"');
    else this.meta.updateTag({ name: 'robots', content: 'noindex' });

    // La vista previa al pegar el enlace en WhatsApp, Instagram o Facebook (O2). Una sola imagen
    // para todo el sitio (A7).
    this.meta.updateTag({ property: 'og:title', content: this.title.getTitle() });
    this.meta.updateTag({ property: 'og:description', content: descripcion });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: `${ORIGEN}/og.jpg` });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:locale', content: 'es_CL' });
    this.meta.updateTag({ property: 'og:site_name', content: 'FEDAL Tennis Center' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
  }

  /**
   * Para la página que sabe su título recién al cargar, como la de un tour (T356): la ruta solo
   * dice «Tour». El canonical y el `noindex` siguen siendo los de la ruta.
   */
  aplicar({ titulo, descripcion }: { titulo: string; descripcion: string }): void {
    this.propio = { url: this.url, titulo, descripcion };
    this.title.setTitle(titulo);
    this.meta.updateTag({ property: 'og:title', content: titulo });
    this.meta.updateTag({ name: 'description', content: descripcion });
    this.meta.updateTag({ property: 'og:description', content: descripcion });
  }

  private canonical(url: string | null): void {
    const cabecera = this.documento.head;
    let enlace = cabecera.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (url === null) {
      enlace?.remove();
      return;
    }
    if (!enlace) {
      enlace = this.documento.createElement('link');
      enlace.rel = 'canonical';
      cabecera.appendChild(enlace);
    }
    enlace.setAttribute('href', url);
  }
}

/** Las rutas activas, del cascarón a la página, por la salida principal. */
function cadenaDe(raiz: ActivatedRouteSnapshot): ActivatedRouteSnapshot[] {
  const cadena: ActivatedRouteSnapshot[] = [];
  for (
    let ruta: ActivatedRouteSnapshot | undefined = raiz;
    ruta;
    ruta = ruta.children.find((hija) => hija.outlet === PRIMARY_OUTLET)
  ) {
    cadena.push(ruta);
  }
  return cadena;
}
