import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Las rutas que salen del build como HTML (T360, SPEC-seo.md A1). Las usa también la verificación
 * del build (`scripts/verificar-prerender.mjs`), que las lee de acá.
 */
export const RUTAS_PRERENDERIZADAS = [
  '',
  'disponibilidad',
  'clases',
  'torneos',
  'tours',
  'ranking',
  'el-club',
  'preguntas-frecuentes',
  'privacidad',
];

/**
 * Cómo se dibuja cada ruta: las de la lista, al compilar; el resto (la cuenta, el panel, entrar,
 * los enlaces con token), en el navegador, como siempre.
 */
export const serverRoutes: ServerRoute[] = [
  ...RUTAS_PRERENDERIZADAS.map((path) => ({ path, renderMode: RenderMode.Prerender as const })),
  { path: '**', renderMode: RenderMode.Client },
];
