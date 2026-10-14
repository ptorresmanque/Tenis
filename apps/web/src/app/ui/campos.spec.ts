import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatFormField, MatFormFieldModule } from '@angular/material/form-field';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatInput } from '@angular/material/input';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import { proveerCampos } from './campos';

/** T244. Cómo van los campos de Material en toda la web (S5). */
describe('proveerCampos', () => {
  @Component({
    imports: [MatFormFieldModule, MatInput],
    providers: [proveerCampos()],
    template: `<mat-form-field><mat-label>Nombre</mat-label><input matInput /></mat-form-field>`,
  })
  class ConUnCampo {}

  const montar = () => {
    const fixture = TestBed.createComponent(ConUnCampo);
    fixture.detectChanges();
    return fixture;
  };
  const elCampo = () =>
    montar().debugElement.query(By.directive(MatFormField)).componentInstance as MatFormField;

  it('**los campos van con contorno**, como el `.campo` de antes', async () => {
    const campo = await TestbedHarnessEnvironment.loader(montar()).getHarness(MatFormFieldHarness);

    expect(await campo.getAppearance()).toBe('outline');
  });

  it('**la etiqueta va siempre arriba**, en el borde, y adentro se ve el formato', () => {
    // Decisión del 2026-10-14: la etiqueta no hace de texto de ayuda. Así se lee siempre, como
    // la de arriba del `.campo`, y el campo vacío muestra «dd-mm-aaaa» o «hh:mm».
    expect(elCampo().floatLabel).toBe('always');
  });

  it('**el lugar del error no se reserva** si el campo no tiene uno', () => {
    expect(elCampo().subscriptSizing).toBe('dynamic');
  });
});
