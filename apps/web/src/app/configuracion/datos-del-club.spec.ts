import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AdminCanchas } from '../catalogo-canchas/admin/admin-canchas.service';
import { DatosDelClub } from './datos-del-club';

describe('DatosDelClub', () => {
  // `value()` de un resource lanza en estado de error.
  it('si los datos no cargan, lo dice y no deja guardar el formulario en blanco', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AdminCanchas,
          useValue: { configuracion: () => Promise.reject(new Error('la API no respondió')) },
        },
      ],
    });

    const fixture = TestBed.createComponent(DatosDelClub);
    await fixture.whenStable();
    fixture.detectChanges();

    const elemento = fixture.nativeElement as HTMLElement;
    expect(elemento.textContent).toContain('No se pudieron cargar los datos del club');
    // Guardar en blanco pisaría la dirección, el teléfono y el correo publicados.
    expect(elemento.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true,
    );
  });
});
