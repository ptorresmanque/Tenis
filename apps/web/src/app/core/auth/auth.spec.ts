import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { Auth } from './auth';

/**
 * Salir tiene que sacar de la pantalla, no solo borrar la cookie: los guards solo
 * corren al navegar, así que el panel de administración quedaba a la vista —y
 * navegable— después de cerrar la sesión.
 */
describe('Auth', () => {
  it('al salir vuelve al inicio', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: HttpClient,
          useValue: { get: () => of(null), post: () => of({}) },
        },
      ],
    });

    const auth = TestBed.inject(Auth);
    const navegar = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);

    await auth.salir();

    expect(navegar).toHaveBeenCalledWith('/');
  });
});
