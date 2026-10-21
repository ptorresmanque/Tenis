// Prueba apps/web/public/robots.txt y sitemap.xml (SPEC-seo.md A1 y A5). Viven en public/ y
// el build los copia tal cual a la raíz del sitio; acá se lee lo que va a servir Apache.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const leer = (archivo) =>
  readFileSync(new URL(`../apps/web/public/${archivo}`, import.meta.url), 'utf8');

/** Las rutas que se prerenderizan, en el orden del menú (A1). */
const PUBLICAS = [
  '/',
  '/disponibilidad',
  '/clases',
  '/torneos',
  '/tours',
  '/ranking',
  '/el-club',
  '/preguntas-frecuentes',
  '/privacidad',
];

describe('robots.txt', () => {
  const reglas = () =>
    leer('robots.txt')
      .split('\n')
      .map((linea) => linea.replace(/#.*/, '').trim())
      .filter(Boolean);

  test('bloquea solo el panel, el estado, la cuenta y la vuelta de Google', () => {
    const bloqueadas = reglas()
      .filter((linea) => linea.startsWith('Disallow:'))
      .map((linea) => linea.slice('Disallow:'.length).trim());
    assert.deepEqual(bloqueadas.sort(), ['/administracion', '/api/auth/', '/estado', '/mi-cuenta']);
  });

  // Googlebot pide la API al renderizar: bloqueada, vería las páginas vacías.
  test('**no bloquea /api/**', () => {
    assert.ok(!reglas().some((linea) => /^Disallow:\s*\/api\/?$/.test(linea)));
  });

  test('vale para todos los rastreadores y nombra el sitemap', () => {
    assert.ok(reglas().includes('User-agent: *'));
    assert.ok(reglas().includes('Sitemap: https://fedal.cl/sitemap.xml'));
  });
});

describe('sitemap.xml', () => {
  const urls = () => [...leer('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  test('lista las nueve rutas públicas, absolutas a fedal.cl', () => {
    assert.deepEqual(
      urls(),
      PUBLICAS.map((ruta) => `https://fedal.cl${ruta}`),
    );
  });

  test('declara el espacio de nombres de sitemaps.org', () => {
    assert.match(
      leer('sitemap.xml'),
      /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
    );
  });
});
