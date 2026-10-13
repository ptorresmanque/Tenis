import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Club } from '../club/club.service';
import { FiltrosDelCatalogo, Tienda } from './tienda.service';

/**
 * T162. **La tienda se ofrece cuando tiene algo que vender**: encendida en este ambiente
 * y con al menos un producto a la venta, que es lo que dice `GET /api/tienda/filtros`
 * cuando trae alguna categoría (`SPEC-tienda.md` § El interruptor).
 */
describe('Tienda', () => {
  const FILTROS: FiltrosDelCatalogo = {
    arriendoRaquetas: '',
    categorias: [{ id: 2, nombre: 'Raquetas' }],
    marcas: [],
    tallas: [],
    precioMin: 9990,
    precioMax: 249990,
  };

  const montar = (tiendaHabilitada: boolean) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Club, useValue: { datos: signal({ tiendaHabilitada }) } },
      ],
    });
    const tienda = TestBed.inject(Tienda);
    TestBed.tick();

    return { tienda, http: TestBed.inject(HttpTestingController) };
  };

  const estable = () => TestBed.inject(ApplicationRef).whenStable();

  it('apagada, no pregunta nada y no se ofrece', () => {
    const { tienda, http } = montar(false);

    http.expectNone('/api/tienda/filtros');
    expect(tienda.abierta()).toBe(false);
  });

  it('**encendida y con algo a la venta, se ofrece**', async () => {
    const { tienda, http } = montar(true);

    http.expectOne('/api/tienda/filtros').flush(FILTROS);
    await estable();

    expect(tienda.abierta()).toBe(true);
  });

  it('encendida pero sin nada a la venta, no se ofrece: el club todavía la está armando', async () => {
    const { tienda, http } = montar(true);

    http.expectOne('/api/tienda/filtros').flush({ ...FILTROS, categorias: [] });
    await estable();

    expect(tienda.abierta()).toBe(false);
  });

  it('si no se puede preguntar, tampoco se ofrece', async () => {
    const { tienda, http } = montar(true);

    http
      .expectOne('/api/tienda/filtros')
      .flush('caída', { status: 502, statusText: 'Bad Gateway' });
    await estable();

    expect(tienda.abierta()).toBe(false);
  });

  it('la ficha de algo que no está a la venta es nula, y cualquier otra falla sigue siendo falla', async () => {
    const { tienda, http } = montar(true);
    http.expectOne('/api/tienda/filtros').flush(FILTROS);

    const borrador = tienda.ficha(5);
    http
      .expectOne('/api/tienda/productos/5')
      .flush('No está', { status: 404, statusText: 'Not Found' });
    expect(await borrador).toBeNull();

    const caida = tienda.ficha(6);
    http
      .expectOne('/api/tienda/productos/6')
      .flush('caída', { status: 502, statusText: 'Bad Gateway' });
    await expect(caida).rejects.toMatchObject({ status: 502 });
  });

  it('la lista va con los filtros como parámetros, y sin los vacíos', async () => {
    const { tienda, http } = montar(true);
    http.expectOne('/api/tienda/filtros').flush(FILTROS);

    const lista = tienda.productos({
      categoriaId: 2,
      marcaId: null,
      talla: '40',
      precioMin: null,
      precioMax: 100000,
      orden: 'precio-asc',
    });
    const peticion = http.expectOne((r) => r.url === '/api/tienda/productos');
    expect(peticion.request.params.toString()).toBe(
      'categoriaId=2&talla=40&precioMax=100000&orden=precio-asc',
    );
    peticion.flush([]);

    expect(await lista).toEqual([]);
  });
});
