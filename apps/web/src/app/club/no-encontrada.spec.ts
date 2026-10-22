import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { NoEncontrada } from './no-encontrada';

/**
 * T355 (SPEC-seo.md A9). Una dirección que no existe ya no cae en la portada: dice que no está y
 * ofrece por dónde seguir.
 */
describe('No encontrada', () => {
  function pagina(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NoEncontrada);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('dice en el título que la página no está', () => {
    expect(pagina().querySelector('h1')?.textContent?.trim()).toBe('No encontramos esta página');
  });

  it('**ofrece reservar e ir al inicio**', () => {
    const enlaces = [...pagina().querySelectorAll('a')].map((a) => [
      a.textContent?.trim(),
      a.getAttribute('href'),
    ]);

    expect(enlaces).toEqual([
      ['Reservar cancha', '/disponibilidad'],
      ['Ir al inicio', '/'],
    ]);
  });
});
