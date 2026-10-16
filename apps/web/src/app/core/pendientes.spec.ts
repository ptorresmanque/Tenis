import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Auth, UsuarioActual } from './auth/auth';
import { Pendientes } from './pendientes';

/**
 * T301 (SPEC-panel.md A10). El conteo de lo que espera es solo del admin: el menú, que también
 * ven el gestor y el profesor, lo inyecta para todos, y a ellos la API les respondería 403.
 */
describe('Pendientes', () => {
  const montar = (usuario: Partial<UsuarioActual> | null) => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { usuario: signal(usuario) } },
      ],
    });
    const pendientes = TestBed.inject(Pendientes);
    TestBed.tick();
    return { pendientes, http: TestBed.inject(HttpTestingController) };
  };

  it('**con el admin, pide el conteo**', async () => {
    const { pendientes, http } = montar({ esAdmin: true });

    http.expectOne('/api/admin/pendientes').flush({ horasPorRevisar: 3, consultasSinAtender: 1 });
    await TestBed.inject(ApplicationRef).whenStable();

    expect(pendientes.conteo()).toEqual({ horasPorRevisar: 3, consultasSinAtender: 1 });
  });

  it('**con el gestor o el profesor no pregunta**: no hay conteo', () => {
    const { pendientes, http } = montar({ esAdmin: false, esGestor: true, profesorId: 7 });

    http.expectNone('/api/admin/pendientes');
    expect(pendientes.conteo()).toBeUndefined();
  });
});
