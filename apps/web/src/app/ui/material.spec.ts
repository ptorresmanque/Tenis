import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIcon } from '@angular/material/icon';
import { describe, expect, it } from 'vitest';

import { proveerMaterial } from './material';

/** T240. Las opciones de Angular Material que valen para toda la web, en un solo lugar. */
describe('proveerMaterial', () => {
  @Component({
    imports: [MatIcon],
    template: `<mat-icon>schedule</mat-icon>`,
  })
  class ConUnIcono {}

  it('**los íconos usan la fuente del sitio** (la clase .icono, Material Symbols Sharp)', async () => {
    TestBed.configureTestingModule({ providers: [proveerMaterial()] });
    const fixture = TestBed.createComponent(ConUnIcono);
    fixture.detectChanges();

    const icono = (fixture.nativeElement as HTMLElement).querySelector('mat-icon')!;
    expect(icono.classList).toContain('icono');
    expect(icono.getAttribute('aria-hidden')).toBe('true');
  });
});
