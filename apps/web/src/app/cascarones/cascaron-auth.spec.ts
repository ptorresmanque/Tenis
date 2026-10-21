import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { CascaronAuth } from './cascaron-auth';

/**
 * Entrar y registro tienen una sola salida, y dice lo mismo que el botón principal del sitio
 * (P2, SPEC-sitio.md, Decimoséptima parte).
 */
describe('Cascarón de entrar y registro', () => {
  it('**la salida dice «Reservar cancha» y lleva a la disponibilidad**', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CascaronAuth);
    fixture.detectChanges();

    const salida = [...(fixture.nativeElement as HTMLElement).querySelectorAll('header a')].find(
      (a) => a.textContent?.trim() === 'Reservar cancha',
    );

    expect(salida?.getAttribute('href')).toBe('/disponibilidad');
  });
});
