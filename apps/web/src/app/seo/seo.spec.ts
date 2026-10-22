import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes, TitleStrategy } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { DESCRIPCION_DEL_SITIO, Seo } from './seo';

@Component({ template: '' })
class Pagina {}

const rutas: Routes = [
  { path: '', title: 'Portada — FEDAL', component: Pagina },
  {
    path: 'clases',
    title: 'Clases — FEDAL',
    data: { descripcion: 'Clases de tenis en Temuco.' },
    component: Pagina,
  },
  {
    path: 'el-club',
    title: 'El club — FEDAL',
    data: { descripcion: 'Canchas, tarifas y horario.' },
    component: Pagina,
  },
  { path: 'sin-descripcion', title: 'Sin descripción — FEDAL', component: Pagina },
  { path: 'tours/:id', title: 'Tour — FEDAL', component: Pagina },
  // Como Mi cuenta: el `noindex` va en el padre y vale para sus pestañas.
  {
    path: 'privada',
    data: { indexar: false },
    children: [{ path: 'adentro', title: 'Adentro — FEDAL', component: Pagina }],
  },
];

const cabecera = () => document.head;
const meta = (selector: string) =>
  cabecera().querySelector<HTMLMetaElement>(`meta[${selector}]`)?.content;
const canonical = () => cabecera().querySelector('link[rel="canonical"]')?.getAttribute('href');

async function llegar(...urls: string[]) {
  TestBed.configureTestingModule({
    providers: [provideRouter(rutas), { provide: TitleStrategy, useExisting: Seo }],
  });
  const harness = await RouterTestingHarness.create();
  for (const url of urls) await harness.navigateByUrl(url);
}

describe('Seo: lo que cada ruta le dice al buscador (T353, SPEC-seo.md)', () => {
  afterEach(() => {
    cabecera()
      .querySelectorAll('meta[name], meta[property], link[rel="canonical"]')
      .forEach((etiqueta) => etiqueta.remove());
  });

  it('escribe el título, la descripción y el canonical de la ruta', async () => {
    await llegar('/clases');

    expect(document.title).toBe('Clases — FEDAL');
    expect(meta('name="description"')).toBe('Clases de tenis en Temuco.');
    expect(canonical()).toBe('https://fedal.cl/clases');
  });

  it('**con Open Graph, para la vista previa al compartir el enlace**', async () => {
    await llegar('/clases');

    expect(meta('property="og:title"')).toBe('Clases — FEDAL');
    expect(meta('property="og:description"')).toBe('Clases de tenis en Temuco.');
    expect(meta('property="og:url"')).toBe('https://fedal.cl/clases');
    expect(meta('property="og:image"')).toBe('https://fedal.cl/og.jpg');
    expect(meta('property="og:type"')).toBe('website');
    expect(meta('property="og:locale"')).toBe('es_CL');
    expect(meta('property="og:site_name"')).toBe('FEDAL Tennis Center');
    expect(meta('name="twitter:card"')).toBe('summary_large_image');
  });

  it('**al cambiar de ruta reemplaza las etiquetas, sin repetirlas**', async () => {
    await llegar('/clases', '/el-club');

    expect(cabecera().querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(cabecera().querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
    expect(cabecera().querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(meta('name="description"')).toBe('Canchas, tarifas y horario.');
    expect(meta('property="og:title"')).toBe('El club — FEDAL');
    expect(canonical()).toBe('https://fedal.cl/el-club');
  });

  it('**el canonical va sin parámetros ni ancla** (A6)', async () => {
    await llegar('/clases?fecha=2026-10-21&cancha=1#arriba');

    expect(canonical()).toBe('https://fedal.cl/clases');
    expect(meta('property="og:url"')).toBe('https://fedal.cl/clases');
  });

  // El router entrega los segmentos decodificados: sin volver a codificarlos, el canonical de
  // `/tours/a%20b` sería una URL con un espacio.
  it('el canonical vuelve a codificar los segmentos', async () => {
    await llegar('/tours/a%20b%3Cc');

    expect(canonical()).toBe('https://fedal.cl/tours/a%20b%3Cc');
  });

  it('el canonical de la portada es el dominio con su barra', async () => {
    await llegar('/');

    expect(canonical()).toBe('https://fedal.cl/');
  });

  it('una ruta sin descripción propia usa la del sitio', async () => {
    await llegar('/clases', '/sin-descripcion');

    expect(meta('name="description"')).toBe(DESCRIPCION_DEL_SITIO);
    expect(meta('property="og:description"')).toBe(DESCRIPCION_DEL_SITIO);
  });

  it('**`indexar: false` en el padre pone noindex, y sin canonical** (A4)', async () => {
    await llegar('/privada/adentro');

    expect(meta('name="robots"')).toBe('noindex');
    expect(canonical()).toBeUndefined();
  });

  it('al volver a una ruta pública se quita el noindex y vuelve el canonical', async () => {
    await llegar('/privada/adentro', '/clases');

    expect(meta('name="robots"')).toBeUndefined();
    expect(canonical()).toBe('https://fedal.cl/clases');
  });

  // T356: para la página que sabe su título recién al cargar, como la de un tour.
  it('**aplicar() cambia el título y la descripción, y deja el canonical de la ruta**', async () => {
    await llegar('/clases');

    TestBed.inject(Seo).aplicar({
      titulo: 'Tour FEDAL — FEDAL Tennis Center',
      descripcion: 'La liga del club.',
    });

    expect(document.title).toBe('Tour FEDAL — FEDAL Tennis Center');
    expect(meta('property="og:title"')).toBe('Tour FEDAL — FEDAL Tennis Center');
    expect(meta('name="description"')).toBe('La liga del club.');
    expect(meta('property="og:description"')).toBe('La liga del club.');
    expect(canonical()).toBe('https://fedal.cl/clases');
  });

  // Elegir otra temporada del tour cambia `?temporada=` y el router vuelve a poner el título.
  it('**lo aplicado sigue si solo cambia la consulta, y se va al cambiar de página**', async () => {
    await llegar('/clases');
    const router = TestBed.inject(Router);
    TestBed.inject(Seo).aplicar({ titulo: 'Tour FEDAL — FEDAL', descripcion: 'La liga.' });

    await router.navigateByUrl('/clases?temporada=2');
    expect(document.title).toBe('Tour FEDAL — FEDAL');
    expect(meta('name="description"')).toBe('La liga.');

    await router.navigateByUrl('/el-club');
    expect(document.title).toBe('El club — FEDAL');
    expect(meta('name="description"')).toBe('Canchas, tarifas y horario.');
  });
});
