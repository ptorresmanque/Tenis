import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { MiCuenta } from './mi-cuenta';

/**
 * T318 (SPEC-sitio.md A8). Mis reservas, Mis partidos y Mi cuenta eran tres pantallas y tres
 * ítems del menú del socio: ahora son una, con tres pestañas.
 */
describe('MiCuenta', () => {
  const montar = async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MiCuenta);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('**se titula «Mi cuenta»**', async () => {
    expect((await montar()).querySelector('h1')?.textContent).toContain('Mi cuenta');
  });

  it('**tiene tres pestañas: Reservas, Partidos y Cuota**, cada una con su dirección', async () => {
    const pestanas = [...(await montar()).querySelectorAll('nav a')].map((a) => [
      a.textContent?.trim(),
      a.getAttribute('href'),
    ]);

    expect(pestanas).toEqual([
      ['Reservas', '/mi-cuenta/reservas'],
      ['Partidos', '/mi-cuenta/partidos'],
      ['Cuota', '/mi-cuenta/cuota'],
    ]);
  });

  it('la barra tiene nombre para el lector de pantalla', async () => {
    expect((await montar()).querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Secciones de tu cuenta',
    );
  });
});
