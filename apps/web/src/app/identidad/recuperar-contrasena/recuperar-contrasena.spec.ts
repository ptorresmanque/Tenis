import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { RecuperarContrasena } from './recuperar-contrasena';

/**
 * Recuperar la contraseña. Sin token, pide el correo; con el token del enlace, pide la
 * contraseña nueva. El token llega en el fragmento (`#token=`), que no viaja al
 * servidor: así no queda en el log de acceso ni en el Referer.
 */
describe('RecuperarContrasena', () => {
  let fixture: ComponentFixture<RecuperarContrasena>;
  let http: HttpTestingController;

  /** `fragmento` es lo que va después del `#` en el enlace del correo. */
  const montar = (fragmento: string | null = null) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { fragment: fragmento } },
        },
      ],
    });

    fixture = TestBed.createComponent(RecuperarContrasena);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent?.replace(/\s+/g, ' ') ?? '';

  const enviarCon = (selector: string, valor: string) => {
    const campo = elemento().querySelector(selector) as HTMLInputElement;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
  };

  const alTerminar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('sin token, pide el enlace con el correo escrito y muestra lo que responde el servidor', async () => {
    montar();

    enviarCon('input[type="email"]', 'ana@ejemplo.cl');
    const peticion = http.expectOne('/api/auth/recuperar');
    expect(peticion.request.body).toEqual({ email: 'ana@ejemplo.cl' });
    peticion.flush({ mensaje: 'Listo. Si ese correo tiene una cuenta…' });
    await alTerminar();

    expect(texto()).toContain('Listo. Si ese correo tiene una cuenta…');
  });

  it('con el token del enlace, manda la contraseña nueva y avisa que quedó cambiada', async () => {
    montar('token=tok-123');

    enviarCon('input[type="password"]', 'saque cruzado al fondo');
    const peticion = http.expectOne('/api/auth/restablecer');
    expect(peticion.request.body).toEqual({
      token: 'tok-123',
      contrasena: 'saque cruzado al fondo',
    });
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    await alTerminar();

    expect(texto()).toContain('Tu contraseña quedó cambiada');
    expect(elemento().querySelector('a[href="/entrar"]')).not.toBeNull();
  });

  it('si el enlace no sirve, muestra el motivo del servidor y ofrece pedir otro', async () => {
    montar('token=vencido');

    enviarCon('input[type="password"]', 'saque cruzado al fondo');
    http
      .expectOne('/api/auth/restablecer')
      .flush(
        { message: 'Ese enlace no sirve: puede haber vencido o ya haberse usado.' },
        { status: 400, statusText: 'Bad Request' },
      );
    await alTerminar();

    expect(texto()).toContain('Ese enlace no sirve');
    expect(elemento().querySelector('a[href="/recuperar-contrasena"]')).not.toBeNull();
  });

  it('un error del servidor no se muestra tal cual', async () => {
    montar();

    enviarCon('input[type="email"]', 'ana@ejemplo.cl');
    http
      .expectOne('/api/auth/recuperar')
      .flush({ message: 'Internal server error' }, { status: 500, statusText: 'Error' });
    await alTerminar();

    expect(texto()).not.toContain('Internal server error');
    expect(texto()).toContain('No pudimos');
  });
});
