import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { beforeEach, describe, expect, it } from 'vitest';

import { TelefonoDirective } from './telefono';

/**
 * T121. El campo de teléfono: el +56 va fijo al lado y en el campo solo entran los 9
 * dígitos (decisión 1 de la sexta parte). Entrega la forma que guarda la API (T120).
 */
@Component({
  imports: [FormsModule, ReactiveFormsModule, TelefonoDirective],
  template: `
    <input id="con-modelo" appTelefono name="t" [(ngModel)]="modelo" />
    <input id="reactivo" appTelefono [formControl]="control" />
  `,
})
class Anfitrion {
  modelo = '56912345678';
  control = new FormControl('', { nonNullable: true });
}

describe('TelefonoDirective', () => {
  let fixture: ComponentFixture<Anfitrion>;

  const campo = (id: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`#${id}`)!;

  const escribir = async (id: string, valor: string) => {
    campo(id).value = valor;
    campo(id).dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Anfitrion);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('**muestra los 9 dígitos de un teléfono guardado, sin el 56**', () => {
    expect(campo('con-modelo').value).toBe('912345678');
  });

  it('**pegar un número con todo lo demás deja los 9 dígitos y entrega la forma guardada**', async () => {
    await escribir('con-modelo', '+56 9 8765-4321');

    expect(campo('con-modelo').value).toBe('987654321');
    expect(fixture.componentInstance.modelo).toBe('56987654321');
  });

  it('quien escribe el 56 a mano termina con los 9 dígitos de su número', async () => {
    await escribir('reactivo', '5698765432');
    await escribir('reactivo', campo('reactivo').value + '1');

    expect(campo('reactivo').value).toBe('987654321');
  });

  it('**solo entran dígitos, y no más de 9**', async () => {
    await escribir('reactivo', '9a8b7');
    expect(campo('reactivo').value).toBe('987');

    await escribir('reactivo', '9876543210');
    expect(campo('reactivo').value).toBe('987654321');
  });

  it('**con menos de 9 dígitos el campo es inválido**; vacío no, si no es obligatorio', async () => {
    await escribir('reactivo', '98765');
    expect(fixture.componentInstance.control.hasError('telefono')).toBe(true);

    await escribir('reactivo', '');
    expect(fixture.componentInstance.control.valid).toBe(true);
    expect(fixture.componentInstance.control.value).toBe('');
  });

  it('**un teléfono de antes, con espacios y +56, es válido**: lo que cuenta son los dígitos', async () => {
    // Una cuenta anterior a T120 lo guardó así. Mostrarlo bien y marcarlo inválido dejaba
    // al visitante sin poder reservar con su propio número.
    fixture.componentInstance.control.setValue('+56 9 1111 2222');
    fixture.detectChanges();

    expect(campo('reactivo').value).toBe('911112222');
    expect(fixture.componentInstance.control.valid).toBe(true);
  });

  it('uno extranjero de antes no pasa por válido aunque el campo muestre 9 dígitos', () => {
    fixture.componentInstance.control.setValue('+54 11 4321 8765');
    fixture.detectChanges();

    expect(fixture.componentInstance.control.hasError('telefono')).toBe(true);
  });

  it('el teléfono del celular abre el teclado de números y propone el número propio', () => {
    expect(campo('reactivo').getAttribute('inputmode')).toBe('numeric');
    expect(campo('reactivo').getAttribute('autocomplete')).toBe('tel-national');
  });

  it('**no tiene maxlength**: el navegador cortaría un número pegado antes de limpiarlo', () => {
    // Con maxlength=9, pegar `+56 9 8765-4321` dejaba entrar `+56 9 876`.
    expect(campo('reactivo').hasAttribute('maxlength')).toBe(false);
  });
});
