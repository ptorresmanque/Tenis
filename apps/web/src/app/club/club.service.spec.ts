import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Club } from './club.service';

describe('Club', () => {
  // `value()` de un resource lanza en estado de error. `datos` lo lee el pie de
  // página, que está en todas las pantallas: si la consulta falla, el sitio entero
  // dejaba de pintarse.
  it('si los datos no cargan, se queda con el nombre del club y sin contacto', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const club = TestBed.inject(Club);
    TestBed.tick();

    TestBed.inject(HttpTestingController)
      .expectOne('/api/club')
      .flush('caída', { status: 500, statusText: 'Internal Server Error' });
    await TestBed.inject(ApplicationRef).whenStable();

    expect(club.datos()).toEqual({
      nombre: 'FEDAL Tennis Center',
      direccion: '',
      telefono: '',
      email: '',
      // Sin ubicación no hay mapa (T101).
      latitud: null,
      longitud: null,
      // Sin redes, el pie no dibuja la lista (T141).
      instagram: '',
      facebook: '',
      tiktok: '',
      youtube: '',
      whatsapp: '',
      // Los textos de "El club" sí: son los de siempre, y la página no queda en blanco
      // (T143).
      elClubTitulo: 'FEDAL Tennis Center',
      elClubBajada: expect.stringContaining('Desde 2008'),
      elClubCanchas: expect.stringContaining('Basilea y Manacor'),
    });
  });
});
