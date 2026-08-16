import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { App } from './app';

describe('App', () => {
  let backend: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
  });

  it('muestra la versión de motor que informa la API', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.tick();

    backend.expectOne('/api/salud').flush({
      estado: 'ok',
      baseDatos: { conectado: true, versionMotor: '11.4.12-MariaDB' },
    });

    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('11.4.12-MariaDB');
  });

  it('avisa cuando la API responde con error en vez de mostrar la pantalla vacía', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.tick();

    backend
      .expectOne('/api/salud')
      .flush(
        { estado: 'degradado', baseDatos: { conectado: false, versionMotor: null } },
        { status: 503, statusText: 'Service Unavailable' },
      );

    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('no responde');
  });
});
