// Revisa el HTML que deja el prerender (T360, SPEC-seo.md). Corre después de `ng build`, dentro de
// `npm run build`: así lo cubre el paso de build del CI y de armar-release.sh, sin tocar ci.yml.
//
// Falla si una ruta de la lista no trae su <head> para el buscador y su H1, o si trae un texto
// que no debería: un error de carga o lo que el servicio Club muestra mientras carga, que en el
// HTML se leería como dato del club. Uso: node scripts/verificar-prerender.mjs [carpeta]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const web = fileURLToPath(new URL('..', import.meta.url));
const salida = process.argv[2] ?? join(web, 'dist/web/browser');

// La lista es la de app.routes.server.ts: una sola fuente para el build y para esta revisión.
const rutasDelServidor = readFileSync(join(web, 'src/app/app.routes.server.ts'), 'utf8');
const lista = rutasDelServidor.match(/RUTAS_PRERENDERIZADAS = \[([^\]]*)\]/)?.[1];
if (lista === undefined)
  throw new Error('No encontré RUTAS_PRERENDERIZADAS en app.routes.server.ts');
const rutas = [...lista.matchAll(/'([^']*)'/g)].map(([, ruta]) => ruta);

const PROHIBIDOS = [
  'No se pudo',
  'No se pudieron',
  'No pudimos',
  'Reintenta',
  // Los textos por omisión del servicio Club (club.service.ts), mientras /api/club no contesta.
  'Desde 2008',
  'Basilea y Manacor',
  // Las cifras de la portada sin el catálogo: «Canchas 0» se leería como dato del club.
  /(Canchas?|Techadas|Con iluminación) 0\b/,
];

// El día del build, en cualquier forma que tome en el HTML (un enlace con ?fecha=, un día del
// selector): lo que depende de hoy va en @defer, o el HTML diría siempre el día en que se compiló.
const zona = { timeZone: 'America/Santiago' };
const hoy = [
  new Intl.DateTimeFormat('en-CA', zona).format(new Date()),
  // Como lo escribe la app: «miércoles, 21 de octubre».
  new Intl.DateTimeFormat('es-CL', {
    ...zona,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date()),
];

// T372: con el arreglo baja 179,5 KB, y su LCP queda en ~2,35 s de los 2,5 de la meta (SPEC-seo.md,
// criterio 8). En gzip de nivel 6, el de zlib por omisión: el de Apache en qa da un 0,3 % más.
const TOPE_DEL_JS_DE_LA_PORTADA_KB = 185;

const fallas = [];
const exigir = (condicion, mensaje) => condicion || fallas.push(mensaje);

// El sitemap lista lo que se prerenderiza (SPEC-seo.md A1): si una ruta entra o sale de la lista
// sin entrar o salir del sitemap, Google pide una página sin HTML o no se entera de una que sí.
const sitemap = readFileSync(join(web, 'public/sitemap.xml'), 'utf8');
const enElSitemap = [...sitemap.matchAll(/<loc>https:\/\/fedal\.cl\/([^<]*)<\/loc>/g)].map(
  ([, ruta]) => ruta,
);
const sobran = enElSitemap.filter((ruta) => !rutas.includes(ruta));
const faltan = rutas.filter((ruta) => !enElSitemap.includes(ruta));
exigir(
  sobran.length === 0,
  `en el sitemap y sin prerender: ${sobran.map((r) => '/' + r).join(', ')}`,
);
exigir(
  faltan.length === 0,
  `prerenderizadas y no en el sitemap: ${faltan.map((r) => '/' + r).join(', ')}`,
);

exigir(
  existsSync(join(salida, 'index.csr.html')),
  'falta index.csr.html, el respaldo de las rutas del navegador',
);

for (const ruta of rutas) {
  const archivo = join(salida, ruta, 'index.html');
  const donde = `/${ruta}`;
  if (!existsSync(archivo)) {
    fallas.push(`${donde}: no se prerenderizó (${archivo})`);
    continue;
  }
  const html = readFileSync(archivo, 'utf8');
  const cabecera = html.slice(0, html.indexOf('</head>'));
  const cuerpo = html.slice(html.indexOf('<body'));
  const texto = cuerpo
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  exigir(/<title>[^<]+<\/title>/.test(cabecera), `${donde}: sin <title>`);
  exigir(/<meta name="description" content="[^"]+"/.test(cabecera), `${donde}: sin descripción`);
  exigir(
    cabecera.includes(`<link rel="canonical" href="https://fedal.cl/${ruta}">`),
    `${donde}: sin canonical a https://fedal.cl/${ruta}`,
  );
  exigir(
    /<meta property="og:image" content="https:\/\/fedal\.cl\/[^"]+"/.test(cabecera),
    `${donde}: sin og:image`,
  );
  const h1 = cuerpo
    .match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]
    .replace(/<[^>]+>/g, '')
    .trim();
  exigir(Boolean(h1), `${donde}: sin H1 con texto`);
  for (const prohibido of PROHIBIDOS) {
    const dice = typeof prohibido === 'string' ? texto.includes(prohibido) : prohibido.test(texto);
    exigir(!dice, `${donde}: el HTML dice «${texto.match(prohibido)?.[0]}»`);
  }
  for (const fecha of hoy) {
    exigir(!cuerpo.includes(fecha), `${donde}: el HTML trae la fecha del build («${fecha}»)`);
  }
  // T371. El build incrusta el CSS crítico y carga la hoja completa en diferido. Sin la regla del
  // oscuro elegido (`data-modo` lo pone el script de index.html en el navegador), quien eligió
  // oscuro con el sistema en claro veía la página clara hasta que llegaba la hoja.
  const incrustado = [...cabecera.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(
    ([, css]) => css,
  );
  exigir(
    incrustado.some((css) => /data-modo=["']?oscuro["']?\]\)?\{[^}]*--color-background:/.test(css)),
    `${donde}: el CSS incrustado no trae el modo oscuro elegido (destello claro al cargar)`,
  );
  // T372. El JS que la portada baja antes de arrancar le quita ancho de banda a la foto que mide el
  // LCP. Es main, los modulepreload (los de la ruta, al final del body) y lo que esos importan: el
  // HTML precarga hasta 10 chunks iniciales y 10 de la ruta, y el resto llega en cascada. Un import
  // de más en Inicio lo hace crecer sin aviso: MatChipsModule y MatTableModule traían los
  // formularios de Angular.
  if (ruta === '') {
    const js = new Set(
      [
        ...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g),
        ...html.matchAll(/<script src="([^"]+)" type="module"/g),
      ].map(([, archivo]) => archivo),
    );
    // Si Angular cambia cómo escribe las etiquetas, que falle y no que deje de contar.
    exigir(
      [...js].some((archivo) => /(^|\/)main-[\w-]+\.js$/.test(archivo)),
      '/: no encontré el script de main entre el JS que pide',
    );
    // Los import estáticos (`import{a as b}from"./chunk-X.js"`), no los import() de los @defer.
    for (const archivo of js)
      for (const [, otro] of readFileSync(join(salida, archivo), 'utf8').matchAll(
        /\bimport\s*(?:[^"'()]*?from\s*)?"\.\/([\w.-]+\.js)"/g,
      ))
        js.add(otro);
    const bytes = [...js].map((archivo) => gzipSync(readFileSync(join(salida, archivo))).length);
    const kb = bytes.reduce((total, b) => total + b, 0) / 1024;
    exigir(
      kb <= TOPE_DEL_JS_DE_LA_PORTADA_KB,
      `/: baja ${kb.toFixed(1)} KB de JS en gzip antes de arrancar (el tope es ${TOPE_DEL_JS_DE_LA_PORTADA_KB})`,
    );
  }
}

if (fallas.length > 0) {
  console.error(`El prerender no pasa la revisión (SPEC-seo.md):\n- ${fallas.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `Prerender revisado: ${rutas.length} ruta(s), con su <head>, su H1 y sin textos de carga.`,
);
