import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Auth } from '../../core/auth/auth';
import { Login } from './login';

describe('Login', () => {
  it('ofrece pedir otro enlace a quien no verificó su correo', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: {} }],
    });

    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[href="/verificar-correo"]'),
    ).not.toBeNull();
  });

  it('ofrece recuperar la contraseña a quien la olvidó', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: {} }],
    });

    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[href="/recuperar-contrasena"]'),
    ).not.toBeNull();
  });
});
