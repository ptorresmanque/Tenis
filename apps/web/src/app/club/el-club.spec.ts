import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Disponibilidad } from '../catalogo-canchas/disponibilidad';
import { ElClub } from './el-club';

describe('ElClub', () => {
  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la API no responde, la página se pinta igual y lo dice en las tarifas', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Disponibilidad,
          useValue: { canchas: () => Promise.reject(new Error('la API no respondió')) },
        },
      ],
    });

    const fixture = TestBed.createComponent(ElClub);
    fixture.detectChanges();
    // El club, las tarifas y los horarios van directo por HTTP.
    for (const peticion of TestBed.inject(HttpTestingController).match(() => true)) {
      peticion.flush('caída', { status: 500, statusText: 'Internal Server Error' });
    }
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Las canchas');
    expect(texto).toContain('No se pudieron cargar las tarifas');
  });
});
