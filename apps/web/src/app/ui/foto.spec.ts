import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ANCHOS_DE_FOTO, cargadorDeFotos, Foto } from './foto';

/**
 * El componente que sostiene el sitio hasta que lleguen las fotos del club.
 *
 * Lo que estos tests protegen no es cómo se ve el marcador de posición: es que
 * **la caja mida exactamente lo mismo con foto y sin ella**. Si no, el día que
 * el club entregue las imágenes la página entera se mueve, y el trabajo de
 * componer cada pantalla habría que rehacerlo contra un layout distinto.
 */
describe('Foto', () => {
  @Component({
    imports: [Foto],
    template: `
      <app-foto
        [descripcion]="descripcion()"
        [proporcion]="proporcion()"
        [src]="src()"
      />
    `,
  })
  class Host {
    readonly descripcion = signal('Las tres canchas al atardecer, con las luces encendidas');
    readonly proporcion = signal<'16/9' | '4/3' | '3/2' | '3/4' | '1/1'>('16/9');
    readonly src = signal<string | null>(null);
  }

  function montar() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('sin foto muestra qué foto va ahí, para que el club sepa qué mandar', () => {
    const { el } = montar();

    expect(el.textContent).toContain('Las tres canchas al atardecer');
  });

  it('sin foto dice la proporción y la resolución mínima que hay que entregar', () => {
    const { el } = montar();

    // "Pásame una foto de las canchas" no sirve: la que llega es vertical y de
    // 800px. El requisito tiene que estar escrito donde va la foto.
    expect(el.textContent).toContain('16/9');
    expect(el.textContent).toMatch(/1600\s*×\s*900/);
  });

  it('el marcador de posición no lo lee el lector de pantalla como si fuera contenido', () => {
    const { el } = montar();
    const marcador = el.querySelector('[data-marcador]');

    // Es un andamio para el equipo, no información para el visitante. Cuando
    // llegue la foto, su alt sí es contenido.
    expect(marcador?.getAttribute('aria-hidden')).toBe('true');
  });

  it('con foto renderiza la imagen y usa la descripción como texto alternativo', () => {
    const { fixture, host, el } = montar();
    host.src.set('/canchas-atardecer.jpg');
    fixture.detectChanges();

    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe(host.descripcion());
  });

  it('con foto ya no queda rastro del marcador de posición', () => {
    const { fixture, host, el } = montar();
    host.src.set('/canchas-atardecer.jpg');
    fixture.detectChanges();

    expect(el.querySelector('[data-marcador]')).toBeNull();
  });

  it('la caja mide igual con foto y sin ella: reemplazarla no mueve la página', () => {
    const { fixture, host, el } = montar();

    const sinFoto = (el.querySelector('[data-caja]') as HTMLElement).style.aspectRatio;
    host.src.set('/canchas-atardecer.jpg');
    fixture.detectChanges();
    const conFoto = (el.querySelector('[data-caja]') as HTMLElement).style.aspectRatio;

    expect(sinFoto).toBe('16/9');
    expect(conFoto).toBe(sinFoto);
  });

  it('cada proporción pide la resolución que le corresponde', () => {
    const { fixture, host, el } = montar();

    host.proporcion.set('3/4');
    fixture.detectChanges();

    expect(el.textContent).toContain('3/4');
    expect(el.textContent).toMatch(/1200\s*×\s*1600/);
  });

  it('dos descripciones distintas no pintan siempre el mismo color', () => {
    // Una pantalla con cuatro marcadores del mismo azul se lee como un error de
    // carga. El color sale de la descripción, así que es estable entre recargas
    // y distinto entre slots vecinos.
    const { fixture, host, el } = montar();
    const caja = () => (el.querySelector('[data-marcador]') as HTMLElement).className;

    const uno = caja();
    host.descripcion.set('Un socio en pleno saque, vertical');
    fixture.detectChanges();

    expect(caja()).not.toBe(uno);
  });

  // T366 (SPEC-seo.md A10). Las fotos del sitio en WebP de varios anchos, y el navegador elige. El
  // de 960 es de T370: un teléfono de 390 px pide 683 a 780 px, y recibía la de 1080.
  it('**con una foto del sitio, el navegador elige entre cuatro WebP**', () => {
    const { fixture, host, el } = montar();
    host.src.set('/fotos/el-club.jpg');
    fixture.detectChanges();

    const img = el.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/fotos/el-club-1080.webp');
    expect(img?.getAttribute('srcset')).toBe(
      '/fotos/el-club-640.webp 640w, /fotos/el-club-960.webp 960w, /fotos/el-club-1080.webp 1080w, ' +
        '/fotos/el-club-1600.webp 1600w',
    );
  });
});

describe('cargadorDeFotos (T366)', () => {
  it.each([
    [640, '/fotos/malla-640.webp'],
    [960, '/fotos/malla-960.webp'],
    [1080, '/fotos/malla-1080.webp'],
    // Un ancho entre dos, a la variante de arriba: más chica se vería borrosa.
    [700, '/fotos/malla-960.webp'],
    [1000, '/fotos/malla-1080.webp'],
    [2400, '/fotos/malla-1600.webp'],
    [undefined, '/fotos/malla-1080.webp'],
  ])('ancho %s → %s', (width, url) => {
    expect(cargadorDeFotos({ src: '/fotos/malla.jpg', width })).toBe(url);
  });

  it('lo que no es una foto del sitio pasa tal cual', () => {
    expect(cargadorDeFotos({ src: '/api/torneos/fotos/1/imagen', width: 640 })).toBe(
      '/api/torneos/fotos/1/imagen',
    );
  });
});

// Una foto nueva sin correr `node scripts/variantes-de-fotos.mjs` se vería rota: el loader pide
// variantes que no existen.
describe('las variantes de public/fotos', () => {
  const carpeta = join(process.cwd(), 'public/fotos');
  const fotos = readdirSync(carpeta).filter((archivo) => archivo.endsWith('.jpg'));

  it.each(fotos)('%s tiene un WebP por cada ancho', (foto) => {
    for (const ancho of ANCHOS_DE_FOTO) {
      expect(existsSync(join(carpeta, foto.replace(/\.jpg$/, `-${ancho}.webp`)))).toBe(true);
    }
  });

  // T370 (SPEC-seo.md, criterio 8). La foto de cabecera es la que mide el LCP de su página, y en un
  // teléfono con 4G lenta baja junto con el JavaScript: con la vista aérea de la portada en 112 KB
  // (1080 px), el LCP no bajaba de 2,5 s. Las tres páginas que se miden: la portada, El club y Clases.
  it.each(['el-club', 'portada', 'ninos'])(
    '**la foto de cabecera %s, en 1080 px, pesa 95 KB o menos**',
    (foto) => {
      const kb = statSync(join(carpeta, `${foto}-1080.webp`)).size / 1024;
      expect(Math.round(kb)).toBeLessThanOrEqual(95);
    },
  );
});
