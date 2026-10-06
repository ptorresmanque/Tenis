import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { VerificarCorreo } from './verificar-correo';

/**
 * Pedir otro enlace de verificación. Sin esta pantalla, un enlace vencido o un correo
 * que no salió dejaban la cuenta sin verificar para siempre.
 */
describe('VerificarCorreo', () => {
  let fixture: ComponentFixture<VerificarCorreo>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    fixture = TestBed.createComponent(VerificarCorreo);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent?.replace(/\s+/g, ' ') ?? '';

  const pedirPara = (correo: string) => {
    const campo = elemento().querySelector('input[type="email"]') as HTMLInputElement;
    campo.value = correo;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    return http.expectOne('/api/auth/reenviar-verificacion');
  };

  const alTerminar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('le pide el enlace a la API con el correo escrito', () => {
    const peticion = pedirPara('ana@ejemplo.cl');

    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ email: 'ana@ejemplo.cl' });
  });

  it('muestra lo que responde el servidor, que es igual tenga o no cuenta el correo', async () => {
    pedirPara('ana@ejemplo.cl').flush({ mensaje: 'Listo. Si ese correo tiene una cuenta…' });
    await alTerminar();

    expect(texto()).toContain('Listo. Si ese correo tiene una cuenta…');
  });

  it('si pidió demasiados, dice cuánto esperar con el texto del servidor', async () => {
    pedirPara('ana@ejemplo.cl').flush(
      { message: 'Ya pediste varios enlaces. Espera 15 minutos.' },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await alTerminar();

    expect(texto()).toContain('Espera 15 minutos');
  });

  it('un error del servidor no se muestra tal cual', async () => {
    pedirPara('ana@ejemplo.cl').flush(
      { message: 'Internal server error' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await alTerminar();

    expect(texto()).not.toContain('Internal server error');
    expect(texto()).toContain('No pudimos');
  });
});
