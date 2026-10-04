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

  it('**al visitante le dice que cambia desde el enlace de su entrada, y cancela con el club** (revisión de la duración elegible)', async () => {
    // Desde T88 quien pagó en línea cambia la hora o la duración desde el enlace del QR.
    // Decirle "sin cuenta no se puede desde la web" lo mandaba a llamar por algo que
    // puede hacer solo. Cancelar sí sigue siendo con el club.
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
            datos: () => ({
              nombre: 'FEDAL Tennis Center',
              direccion: '',
              telefono: '',
              email: 'contacto@fedal.cl',
            }),
          },
        },
        {
          provide: ReservasPublicas,
          useValue: {
            porToken: () =>
              Promise.resolve({
                folio: 'AB23CDE',
                cancha: 'Cancha 1',
                inicio: '2026-08-17T12:00:00.000Z',
                fin: '2026-08-17T13:00:00.000Z',
                nombre: 'Rafael Nadal',
                esPico: false,
                estado: 'CONFIRMADA',
                acompanantes: 0,
                pagadoClp: 12000,
                sePuedeCambiar: true,
              }),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(ConfirmacionReserva);
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('abre el enlace de tu entrada');
    expect(texto).toContain('Para cancelarla, escribe a contacto@fedal.cl');
    expect(texto).not.toContain('no se puede hacer desde la web');
  });
});
