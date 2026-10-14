import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatInputHarness } from '@angular/material/input/testing';
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

  it('**el campo que falta lo dice en el campo**, y no solo en rojo (T245)', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: { refrescar: () => undefined } }],
    });
    const fixture = TestBed.createComponent(Login);
    const raiz = TestbedHarnessEnvironment.loader(fixture);
    const correo = await raiz.getHarness(MatFormFieldHarness.with({ floatingLabelText: 'Correo' }));

    const email = MatInputHarness.with({ selector: '[formControlName="email"]' });
    await (await raiz.getHarness(email)).blur();

    expect(await correo.getTextErrors()).toEqual(['Falta este dato.']);
  });
});
