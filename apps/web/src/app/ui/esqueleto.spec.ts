import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Esqueleto } from './esqueleto';

/**
 * T278. La espera se ve (SPEC-revision-qa.md A5): las barras grises solas parecían datos que
 * faltaban. Una vista entera lleva la barra de Material arriba; un espacio chico, el círculo.
 * En los dos el texto está a la vista.
 */
describe('El esqueleto de una carga', () => {
  @Component({
    imports: [Esqueleto],
    template: `<app-esqueleto [filas]="3" etiqueta="Cargando las cuotas…" [compacto]="compacto()" />`,
  })
  class Anfitrion {
    readonly compacto = signal(false);
  }

  const montar = (compacto = false) => {
    const fixture = TestBed.createComponent(Anfitrion);
    fixture.componentInstance.compacto.set(compacto);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('**una vista entera: la barra indeterminada arriba, el texto y las filas**', () => {
    const el = montar();
    const barra = el.querySelector('mat-progress-bar');

    expect(barra?.getAttribute('mode')).toBe('indeterminate');
    expect(el.querySelector('[data-etiqueta]')?.textContent?.trim()).toBe('Cargando las cuotas…');
    expect(el.querySelectorAll('[data-fila]')).toHaveLength(3);
    expect(el.querySelector('mat-progress-spinner')).toBeNull();
  });

  it('**el texto se ve**: ya no queda solo para el lector de pantalla', () => {
    expect(montar().querySelector('[data-etiqueta]')?.className).not.toContain('sr-only');
  });

  it('**compacto: el círculo chico y el texto, sin filas**', () => {
    const el = montar(true);

    expect(el.querySelector('mat-progress-spinner')?.getAttribute('mode')).toBe('indeterminate');
    expect(el.querySelector('[data-etiqueta]')?.textContent?.trim()).toBe('Cargando las cuotas…');
    expect(el.querySelector('mat-progress-bar')).toBeNull();
    expect(el.querySelectorAll('[data-fila]')).toHaveLength(0);
  });

  describe('con «reducir movimiento»', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('**el círculo va quieto en tres cuartos**: congelado, quedaba en un punto', () => {
      vi.stubGlobal('matchMedia', (consulta: string) => ({
        matches: consulta === '(prefers-reduced-motion: reduce)',
      }));
      const circulo = montar(true).querySelector('mat-progress-spinner');

      expect(circulo?.getAttribute('mode')).toBe('determinate');
      expect(circulo?.getAttribute('aria-valuenow')).toBe('75');
    });
  });

  it('la barra y el círculo no se anuncian: el texto ya lo dice', () => {
    expect(montar().querySelector('mat-progress-bar')?.getAttribute('aria-hidden')).toBe('true');
    expect(montar(true).querySelector('mat-progress-spinner')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});
