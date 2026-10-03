import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Transmision } from '../torneos.service';
import { Reproductor } from './reproductor';

/**
 * T68. El reproductor de la transmisión.
 *
 * Lo que este archivo cuida: que **el `iframe` de YouTube no exista hasta el clic**.
 * Sin eso, cualquiera que abra el calendario del torneo carga scripts de Google y
 * queda identificado por mirar una página del club, aunque no toque nada.
 */
describe('Reproductor', () => {
  const EN_VIVO: Transmision = {
    id: 3,
    canchaId: 1,
    cancha: 'Cancha 1',
    url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    miniatura: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    titulo: 'Cancha 1 — sábado',
    inicio: '2026-11-07T13:00:00.000Z',
    fin: '2026-11-07T22:00:00.000Z',
  };

  let fixture: ComponentFixture<Reproductor>;

  const montar = async (transmision: Transmision) => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Reproductor);
    fixture.componentRef.setInput('transmision', transmision);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;

  const reproducir = async () => {
    elemento().querySelector('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar(EN_VIVO);
  });

  it('**no carga nada de YouTube hasta que alguien aprieta play**', () => {
    expect(elemento().querySelector('iframe')).toBeNull();
  });

  it('la miniatura se ve antes del clic, para saber qué se va a abrir', () => {
    const imagen = elemento().querySelector('img');

    expect(imagen?.getAttribute('src')).toBe(EN_VIVO.miniatura);
  });

  it('al apretar play aparece el video, en la página y no en YouTube', async () => {
    await reproducir();

    const marco = elemento().querySelector('iframe');
    expect(marco?.getAttribute('src')).toBe(EN_VIVO.url);
  });

  it('**el video se ve en el sitio, sin dominio con cookies**', async () => {
    await reproducir();

    // La URL la arma el servidor; acá se comprueba que la que llega es la que se usa.
    expect(elemento().querySelector('iframe')?.getAttribute('src')).toContain(
      'youtube-nocookie.com',
    );
  });

  it('**el botón dice de qué cancha es**: hay varios en la misma página', () => {
    expect(elemento().querySelector('button')?.textContent).toContain('Cancha 1');
  });

  it('lleva su rótulo de transmisión, con la cancha (TV4.3)', () => {
    expect(elemento().querySelector('[data-rotulo]')?.textContent).toContain('Cancha 1');
  });

  it('el rótulo no se suma al nombre del botón: se oye una vez', () => {
    // Lo que llega al lector: todo lo que no cuelga de un aria-hidden.
    const boton = elemento().querySelector('button')!.cloneNode(true) as HTMLElement;
    boton.querySelectorAll('[aria-hidden="true"]').forEach((oculto) => oculto.remove());

    expect(boton.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Ver la transmisión de Cancha 1',
    );
  });

  it('**avisa que el live va corrido**, para no prometer un partido', () => {
    expect(elemento().textContent).toContain('partido anterior');
  });

  it('sin título igual dice la cancha', async () => {
    await montar({ ...EN_VIVO, titulo: null });

    const pie = elemento().querySelector('figcaption')?.textContent ?? '';
    expect(pie).toContain('Cancha 1');
    expect(pie).not.toContain('·');
  });

  it('**la fuente no cambia de identidad entre lecturas**', async () => {
    // Si cada lectura devuelve un `SafeResourceUrl` nuevo, Angular ve un valor distinto
    // en cada detección de cambios, reescribe el `src` del `iframe` y **el partido
    // vuelve al segundo cero**: basta con que el visitante abra otra categoría
    // mientras mira. Por eso es un `computed` y no un método.
    await reproducir();
    const lector = fixture.componentInstance as unknown as { fuente(): unknown };

    expect(lector.fuente()).toBe(lector.fuente());
  });
});
