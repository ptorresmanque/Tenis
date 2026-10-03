import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Club } from '../club/club.service';
import { Auth } from '../core/auth/auth';
import { ConfirmacionReserva } from './confirmacion';
import { ReservasPublicas } from './reserva-publica.service';

describe('ConfirmacionReserva', () => {
  // `value()` de un resource lanza en estado de error. Es la pantalla a la que se
  // vuelve después de pagar: si el detalle no cargaba, se perdía también el folio.
  it('si el detalle no carga, lo dice y deja el folio a la vista', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({ folio: 'AB23CDE', t: 'un-token' })),
          },
        },
        { provide: Auth, useValue: { usuario: signal(null).asReadonly() } },
        {
          provide: Club,
          useValue: {
            datos: () => ({ nombre: 'FEDAL Tennis Center', direccion: '', telefono: '', email: '' }),
          },
        },
        {
          provide: ReservasPublicas,
          useValue: { porToken: () => Promise.reject(new Error('la API no respondió')) },
        },
      ],
    });

    const fixture = TestBed.createComponent(ConfirmacionReserva);
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('AB23CDE');
    expect(texto).toContain('No se pudo cargar el resumen');
  });
});
