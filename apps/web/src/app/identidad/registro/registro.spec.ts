import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Registro } from './registro';

/**
 * D9. Crear la cuenta es entregar datos personales: el formulario tiene que decir
 * antes quién puede tener una y dónde se lee qué se hace con ellos.
 */
describe('Registro', () => {
  function montar(): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    const fixture = TestBed.createComponent(Registro);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  it('enlaza la política de privacidad en otra pestaña, para no perder lo escrito', () => {
    const enlace = montar().querySelector('form a[href="/privacidad"]');

    expect(enlace?.getAttribute('target')).toBe('_blank');
  });

  it('dice que las cuentas son para mayores de 18 años', () => {
    // Los menores juegan con un adulto responsable, que es quien tiene la cuenta.
    expect(montar().textContent).toContain('mayores de 18 años');
  });
});
