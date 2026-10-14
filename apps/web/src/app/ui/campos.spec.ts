import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';
import { MatFormField, MatFormFieldModule } from '@angular/material/form-field';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatInput } from '@angular/material/input';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import { errorDelCampo, proveerCampos } from './campos';

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

/**
 * T245. El mensaje de un campo que no pasa su validación, en `mat-error`: el campo en rojo
 * sin decir por qué no le sirve a nadie, y el lineamiento pide el texto.
 */
describe('errorDelCampo', () => {
  it('**lo que falta lo dice**', () => {
    expect(errorDelCampo(new FormControl('', Validators.required))).toBe('Falta este dato.');
  });

  it('**un correo mal escrito dice cómo es uno bueno**', () => {
    const correo = new FormControl('ana@', Validators.email);

    expect(errorDelCampo(correo)).toBe('Escribe un correo válido, como nombre@correo.cl.');
  });

  it('**lo corto dice cuánto le falta**: el mínimo, con su número', () => {
    const contrasena = new FormControl('corta', Validators.minLength(10));

    expect(errorDelCampo(contrasena)).toBe('Tiene que tener al menos 10 caracteres.');
  });

  it('**un teléfono incompleto dice cuántos dígitos son**: el +56 ya va', () => {
    const telefono = new FormControl('569876');
    telefono.setErrors({ telefono: true });

    expect(errorDelCampo(telefono)).toBe('Son 9 dígitos, como 9 8765 4321.');
  });

  it('un campo sin errores no dice nada', () => {
    expect(errorDelCampo(new FormControl('ana@club.cl', Validators.email))).toBe('');
  });
});
