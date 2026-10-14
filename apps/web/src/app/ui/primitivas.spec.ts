import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Paginacion } from './paginacion';

/**
 * Las primitivas que tienen lógica y no solo clases (el campo se fue a Material en T245, y el
 * selector, a mat-button-toggle-group en T251).
 *
 * Las otras cuatro —insignia, aviso, estado vacío y barra fija— son marcado con
 * una tabla de variantes, y lo único que puede romperse en ellas es el
 * contraste, que mide `design-tokens.spec.ts` leyendo esa misma tabla.
 */

describe('Paginación', () => {
  @Component({
    imports: [Paginacion],
    template: `
      <app-paginacion [(pagina)]="pagina" [total]="total()" [porPagina]="10" />
    `,
  })
  class Host {
    readonly pagina = signal(1);
    readonly total = signal(25);
  }

  function montar() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const elemento = fixture.nativeElement as HTMLElement;
    const botones = [...elemento.querySelectorAll('button')];

    return {
      fixture,
      host: fixture.componentInstance,
      anterior: botones[0],
      siguiente: botones[1],
      cuenta: () => elemento.querySelector('p')?.textContent?.trim(),
    };
  }

  it('cuenta las páginas por lo alto: 25 en tandas de 10 son 3', () => {
    expect(montar().cuenta()).toBe('Página 1 de 3');
  });

  it('en la primera no se puede ir atrás, y en la última no adelante', () => {
    const { fixture, host, anterior, siguiente } = montar();

    expect(anterior.disabled).toBe(true);

    host.pagina.set(3);
    fixture.detectChanges();

    expect(siguiente.disabled).toBe(true);
  });

  it('avanzar y retroceder le avisan al de afuera', () => {
    const { fixture, host, anterior, siguiente } = montar();

    siguiente.click();
    fixture.detectChanges();
    expect(host.pagina()).toBe(2);

    anterior.click();
    fixture.detectChanges();
    expect(host.pagina()).toBe(1);
  });

  it('una lista vacía sigue siendo una página, no cero', () => {
    const { fixture, host, cuenta } = montar();

    host.total.set(0);
    fixture.detectChanges();

    expect(cuenta()).toBe('Página 1 de 1');
  });
});
