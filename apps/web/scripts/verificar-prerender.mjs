// Revisa el HTML que deja el prerender (T360, SPEC-seo.md). Corre después de `ng build`, dentro de
// `npm run build`: así lo cubre el paso de build del CI y de armar-release.sh, sin tocar ci.yml.
//
// Falla si una ruta de la lista no trae su <head> para el buscador y su H1, o si trae un texto
// que no debería: un error de carga o lo que el servicio Club muestra mientras carga, que en el
// HTML se leería como dato del club. Uso: node scripts/verificar-prerender.mjs [carpeta]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const web = new URL('..', import.meta.url).pathname;
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
    exigir(!texto.includes(prohibido), `${donde}: el HTML dice «${prohibido}»`);
  }
  for (const fecha of hoy) {
    exigir(!cuerpo.includes(fecha), `${donde}: el HTML trae la fecha del build («${fecha}»)`);
  }
}

if (fallas.length > 0) {
  console.error(`El prerender no pasa la revisión (SPEC-seo.md):\n- ${fallas.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `Prerender revisado: ${rutas.length} ruta(s), con su <head>, su H1 y sin textos de carga.`,
);
