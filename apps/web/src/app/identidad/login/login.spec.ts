import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
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

  describe('después de entrar', () => {
    @Component({ template: '' })
    class Vacia {}

    /** Entra con una sesión que el servidor acepta, desde `url`, y dice dónde terminó. */
    async function entrarDesde(url: string): Promise<string> {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: '', pathMatch: 'full', component: Vacia },
            { path: 'entrar', component: Login },
            { path: 'mi-cuenta/cuota', component: Vacia },
            { path: '**', component: Vacia },
          ]),
          { provide: Auth, useValue: { entrar: () => Promise.resolve() } },
        ],
      });
      const harness = await RouterTestingHarness.create(url);
      const raiz = TestbedHarnessEnvironment.loader(harness.fixture);

      const campo = (nombre: string) =>
        raiz.getHarness(MatInputHarness.with({ selector: `[formControlName="${nombre}"]` }));
      await (await campo('email')).setValue('socia@fedal.cl');
      await (await campo('contrasena')).setValue('una-clave');
      await (await raiz.getHarness(MatButtonHarness.with({ text: 'Entrar' }))).click();
      await harness.fixture.whenStable();

      return TestBed.inject(Router).url;
    }

    it('lleva al inicio si no venía de ninguna parte', async () => {
      expect(await entrarDesde('/entrar')).toBe('/');
    });

    it('vuelve a la pantalla que se pidió sin sesión, con su consulta', async () => {
      // El enlace del correo de la cuota, abierto en el teléfono sin sesión.
      expect(
        await entrarDesde('/entrar?volver=%2Fmi-cuenta%2Fcuota%3Fpago%3Dlisto'),
      ).toBe('/mi-cuenta/cuota?pago=listo');
    });

    // El `volver` lo puede escribir cualquiera en un enlace: si no es una ruta de este
    // sitio, entrar no puede terminar en otro. El navegador lee `//otro.cl` y `/\otro.cl`
    // como el dominio otro.cl.
    it.each([
      ['//otro.cl', '%2F%2Fotro.cl'],
      ['/\\otro.cl', '%2F%5Cotro.cl'],
      ['https://otro.cl', 'https%3A%2F%2Fotro.cl'],
      ['otro.cl', 'otro.cl'],
    ])('con volver=%s lleva al inicio', async (_volver, escapado) => {
      expect(await entrarDesde(`/entrar?volver=${escapado}`)).toBe('/');
    });
  });
});
