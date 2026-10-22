import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PaginaDeDisponibilidad } from './pagina-de-disponibilidad';

/**
 * T362 (SPEC-seo.md D1). `/disponibilidad` sale del build con su H1 y un esqueleto: la grilla, que
 * depende de la fecha de hoy y de la API, se dibuja en el navegador.
 */
describe('PaginaDeDisponibilidad', () => {
  const antesDeAbrir = async () => {
    TestBed.configureTestingModule({ deferBlockBehavior: DeferBlockBehavior.Manual });
    const fixture = TestBed.createComponent(PaginaDeDisponibilidad);
    fixture.detectChanges();
    return { fixture, pagina: fixture.nativeElement as HTMLElement };
  };

  it('antes de la grilla muestra el título y el esqueleto, que es lo que queda en el HTML', async () => {
    const { pagina } = await antesDeAbrir();

    expect(pagina.querySelector('h1')?.textContent?.trim()).toBe('Reserva tu cancha');
    expect(pagina.querySelector('app-esqueleto')).not.toBeNull();
    expect(pagina.querySelector('app-grilla')).toBeNull();
  });

  it('la grilla va en un solo bloque diferido', async () => {
    const { fixture } = await antesDeAbrir();

    expect(await fixture.getDeferBlocks()).toHaveLength(1);
  });

  // El título del esqueleto es el que la grilla dibuja después: si cambia uno solo, la página
  // salta de un título a otro al terminar de cargar.
  it('**su título es el mismo que el de la grilla**', async () => {
    const { pagina } = await antesDeAbrir();
    const grilla = readFileSync(
      join(process.cwd(), 'src/app/catalogo-canchas/grilla/grilla.ts'),
      'utf8',
    );

    expect(grilla).toContain(
      `${pagina.querySelector('h1')?.outerHTML.replace(/ _ngcontent[^=]*=""/g, '')}`,
    );
  });
});
