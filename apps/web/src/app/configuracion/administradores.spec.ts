import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Auth } from '../core/auth/auth';
import { AdministradoresPanel } from './administradores';
import { Administradores } from './administradores.service';

describe('AdministradoresPanel', () => {
  // `value()` de un resource lanza en estado de error.
  it('si la lista no carga, lo dice', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { usuario: signal(null).asReadonly() } },
        {
          provide: Administradores,
          useValue: { listar: () => Promise.reject(new Error('la API no respondió')) },
        },
      ],
    });

    const fixture = TestBed.createComponent(AdministradoresPanel);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No se pudieron cargar los administradores',
    );
  });
});
