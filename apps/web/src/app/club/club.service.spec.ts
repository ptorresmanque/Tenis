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
      // La tienda y la cafetería, vacías: sin descripción no se muestran (T184).
      tienda: { descripcion: '', horario: '', whatsapp: '' },
      cafeteria: { descripcion: '', horario: '', whatsapp: '' },
    });
  });

  it('**recargar() vuelve a preguntar**: lo que el panel guardó se ve sin recargar la página', async () => {
    // El sitio pide los datos una vez por visita. Sin esto, quien guardaba una red en el
    // panel y volvía al sitio sin recargar seguía viendo la ficha de antes.
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const club = TestBed.inject(Club);
    const http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/api/club').flush({ ...club.datos(), instagram: '' });
    await TestBed.inject(ApplicationRef).whenStable();

    club.recargar();
    TestBed.tick();
    http
      .expectOne('/api/club')
      .flush({ ...club.datos(), instagram: 'https://www.instagram.com/fedaltennis' });
    await TestBed.inject(ApplicationRef).whenStable();

    expect(club.datos().instagram).toBe('https://www.instagram.com/fedaltennis');
  });
});
