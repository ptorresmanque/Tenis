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

    /**
     * Pasa por `urls` en orden, entra con una sesión que el servidor acepta desde la
     * última y dice dónde terminó.
     */
    async function entrarDesde(...urls: string[]): Promise<string> {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: '', pathMatch: 'full', component: Vacia },
            { path: 'entrar', component: Login },
            { path: 'mi-cuenta/cuota', component: Vacia },
            // Una pantalla que se baja aparte y no llega: sin red, o un despliegue que
            // reemplazó sus archivos.
            {
              path: 'administracion/canchas',
              loadComponent: () => Promise.reject(new Error('No se pudo bajar la pantalla')),
            },
            { path: '**', component: Vacia },
          ]),
          { provide: Auth, useValue: { entrar: () => Promise.resolve() } },
        ],
      });
      const harness = await RouterTestingHarness.create();
      for (const url of urls) await harness.navigateByUrl(url);
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
      // Como la vuelta de Webpay a la cuota, que trae su aviso en `?pago=`.
      expect(await entrarDesde('/entrar?volver=%2Fmi-cuenta%2Fcuota%3Fpago%3Dlisto')).toBe(
        '/mi-cuenta/cuota?pago=listo',
      );
    });

    it('usa el volver de ahora si Entrar se reutiliza con otro', async () => {
      // De /entrar a una pantalla con guard, que devuelve a /entrar?volver=…: es la
      // misma ruta, así que Angular no crea otro Login.
      expect(await entrarDesde('/entrar', '/entrar?volver=%2Fmi-cuenta%2Fcuota')).toBe(
        '/mi-cuenta/cuota',
      );
    });

    it('si la pantalla no carga, no culpa a la contraseña', async () => {
      const volver = '/entrar?volver=%2Fadministracion%2Fcanchas';

      expect(await entrarDesde(volver)).toBe(volver);
      const texto = document.body.textContent ?? '';
      expect(texto).not.toContain('Correo o contraseña incorrectos.');
      expect(texto).toContain('Ya entraste, pero la página no cargó.');
    });

    // El `volver` lo puede escribir cualquiera en un enlace: entrar no puede terminar en
    // otro sitio ni en una ruta rara. El navegador lee `//otro.cl` y `/\otro.cl` como el
    // dominio otro.cl, si alguna vez la vuelta sale del router.
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
