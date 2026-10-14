import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { alternar } from '../testing/alternar';
import { ConmutadorDeTema } from './conmutador-de-tema';
import { Tema } from './tema';

/**
 * El conmutador de tema de la barra (T251): tres opciones que solo muestran su ícono, así que
 * cada una tiene que decir su nombre a quien no lo ve.
 */
describe('ConmutadorDeTema', () => {
  const montar = () => {
    const fixture = TestBed.createComponent(ConmutadorDeTema);
    fixture.detectChanges();
    return fixture;
  };

  it('son tres opciones, cada una con su nombre', () => {
    const fixture = montar();
    const opciones = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button[role="radio"]'),
    ];

    expect(opciones.map((o) => o.getAttribute('aria-label'))).toEqual([
      'Según el sistema',
      'Claro',
      'Oscuro',
    ]);
  });

  it('elegir una cambia el tema del sitio', async () => {
    const fixture = montar();

    await alternar(fixture, 'oscuro');

    expect(TestBed.inject(Tema).modo()).toBe('oscuro');
  });
});
