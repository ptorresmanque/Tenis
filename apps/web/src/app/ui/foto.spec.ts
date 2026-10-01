import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Foto } from './foto';

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
});
