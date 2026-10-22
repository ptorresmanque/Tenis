import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';

import { routes } from '../../app.routes';
import { Auth, UsuarioActual } from './auth';

/**
 * Sin sesión, `/mi-cuenta` abría igual y la pestaña de Reservas mostraba «No se pudieron
 * cargar tus reservas», con el 401 de la API en la consola. Corre con las rutas de verdad:
 * lo que importa es dónde termina la navegación.
 */
describe('conSesion', () => {
  const SOCIA: UsuarioActual = {
    id: 2,
    nombre: 'Camila',
    apellido: 'Vera',
    telefono: null,
    email: 'camila@clubdetenis.cl',
    esAdmin: false,
    esGestor: false,
    socioId: 7,
    socioActivo: true,
    socioAlDia: true,
    profesorId: null,
  };

  /**
   * Navega a `url` recién cargada la página: la sesión empieza sin resolver y `refrescar`
   * trae la que responde el servidor.
   */
  async function navegarCon(usuario: UsuarioActual | null, url: string) {
    const estado = signal<UsuarioActual | null>(null);

    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Auth,
          useValue: {
            usuario: estado.asReadonly(),
            refrescar: async () => estado.set(usuario),
          },
        },
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);

    return TestBed.inject(Router).url;
  }

  // Con la pantalla a la que iba, para volver a ella después de entrar: los correos de cuota y
  // de partidos enlazan directo a su pestaña. Las redirecciones corren antes que el guard, así
  // que `/mi-cuenta` y `/mis-reservas` ya llegan como `/mi-cuenta/reservas`.
  it.each([
    ['/mi-cuenta', '/entrar?volver=%2Fmi-cuenta%2Freservas'],
    ['/mi-cuenta/reservas', '/entrar?volver=%2Fmi-cuenta%2Freservas'],
    ['/mi-cuenta/cuota', '/entrar?volver=%2Fmi-cuenta%2Fcuota'],
    ['/mi-cuenta/partidos', '/entrar?volver=%2Fmi-cuenta%2Fpartidos'],
    ['/mis-reservas', '/entrar?volver=%2Fmi-cuenta%2Freservas'],
  ])('sin sesión, %s lleva a Entrar con la vuelta', async (url, entrar) => {
    expect(await navegarCon(null, url)).toBe(entrar);
  });

  it('con sesión, Mi cuenta abre en Reservas, aunque se entre directo por URL', async () => {
    expect(await navegarCon(SOCIA, '/mi-cuenta')).toBe('/mi-cuenta/reservas');
  });

  it('con sesión, la vuelta de Webpay conserva su aviso', async () => {
    expect(await navegarCon(SOCIA, '/mi-cuenta/cuota?pago=listo')).toBe(
      '/mi-cuenta/cuota?pago=listo',
    );
  });
});
