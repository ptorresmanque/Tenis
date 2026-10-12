import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas } from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { TiendaYCafeteriaPanel } from './tienda-y-cafeteria';

/**
 * T184. La tienda y la cafetería del club, como información: descripción, horario y
 * WhatsApp de cada una. Las escribe el club desde su panel; el sitio no vende nada.
 */
describe('TiendaYCafeteriaPanel', () => {
  /** El servicio del sitio, falso: el real pide /api/club y estos tests no tienen HTTP. */
  const club = { recargar: vi.fn() };
  beforeEach(() => club.recargar.mockClear());

  const GUARDADOS = {
    tiendaDescripcion: 'Raquetas, cuerdas y zapatillas.',
    tiendaHorario: 'Lunes a sábado de 9:00 a 20:00',
    tiendaWhatsapp: '56987654321',
    cafeteriaDescripcion: '',
    cafeteriaHorario: '',
    cafeteriaWhatsapp: '',
  };

  const montar = async (
    configuracion: () => Promise<unknown> = () => Promise.resolve(GUARDADOS),
    fijar: () => Promise<unknown> = () => Promise.resolve(GUARDADOS),
  ) => {
    const api = {
      configuracion: vi.fn(configuracion),
      fijarTiendaYCafeteria: vi.fn(fijar),
      // Las fotos (T185) van en su propio componente, debajo; acá, sin ninguna.
      fotosDelClub: vi.fn().mockResolvedValue({ TIENDA: [], CAFETERIA: [] }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminCanchas, useValue: api },
        { provide: Club, useValue: club },
      ],
    });
    const fixture = TestBed.createComponent(TiendaYCafeteriaPanel);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, api, elemento: fixture.nativeElement as HTMLElement };
  };

  /** Un campo de un lugar, por la leyenda de su grupo y su etiqueta, como lo busca una persona. */
  const campo = (elemento: HTMLElement, lugar: string, etiqueta: string) => {
    const grupo = Array.from(elemento.querySelectorAll('fieldset')).find((f) =>
      f.querySelector('legend')?.textContent?.includes(lugar),
    );

    return Array.from(grupo?.querySelectorAll('label') ?? [])
      .find((l) => l.textContent?.includes(etiqueta))
      ?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  };

  const escribir = async (
    fixture: { whenStable: () => Promise<unknown> },
    control: HTMLInputElement | HTMLTextAreaElement,
    valor: string,
  ) => {
    control.value = valor;
    control.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  const guardar = (elemento: HTMLElement) =>
    elemento.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

  it('muestra lo guardado de cada lugar; la descripción en un área de texto', async () => {
    const { elemento } = await montar();

    expect(campo(elemento, 'Tienda', 'Descripción')?.tagName).toBe('TEXTAREA');
    expect(campo(elemento, 'Tienda', 'Descripción')?.value).toBe(
      'Raquetas, cuerdas y zapatillas.',
    );
    expect(campo(elemento, 'Tienda', 'Horario')?.value).toBe(
      'Lunes a sábado de 9:00 a 20:00',
    );
    expect(campo(elemento, 'Cafetería', 'Descripción')?.value).toBe('');
  });

  it('el WhatsApp de cada lugar lleva el +56 fijo y muestra los 9 dígitos', async () => {
    const { elemento } = await montar();
    const whatsapp = campo(elemento, 'Tienda', 'WhatsApp');

    expect(whatsapp?.closest('.campo-con-prefijo')?.textContent).toContain('+56');
    expect(whatsapp?.value.replace(/\D/g, '')).toBe('987654321');
  });

  it('no deja escribir más de lo que cabe, y dice cuánto queda', async () => {
    const { elemento } = await montar();
    const descripcion = campo(elemento, 'Cafetería', 'Descripción')!;

    expect(descripcion.maxLength).toBe(600);
    expect(campo(elemento, 'Cafetería', 'Horario')!.maxLength).toBe(120);
    expect(descripcion.closest('label')?.textContent).toContain('Quedan 600 caracteres');
  });

  it('al guardar manda los seis campos, con lo que se escribió', async () => {
    const { fixture, api, elemento } = await montar();

    await escribir(
      fixture,
      campo(elemento, 'Cafetería', 'Descripción')!,
      'Café, jugos y sándwiches.',
    );
    guardar(elemento);
    await fixture.whenStable();

    expect(api.fijarTiendaYCafeteria).toHaveBeenCalledWith({
      ...GUARDADOS,
      cafeteriaDescripcion: 'Café, jugos y sándwiches.',
    });
  });

  it('**al guardar, el sitio vuelve a pedir los datos**: la portada los muestra sin recargar', async () => {
    const { fixture, elemento } = await montar();

    guardar(elemento);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(club.recargar).toHaveBeenCalledTimes(1);
    expect(elemento.textContent).toContain('Guardado');
  });

  it('si la API rechaza, muestra su mensaje', async () => {
    const { fixture, elemento } = await montar(undefined, () =>
      Promise.reject({
        error: { message: 'El WhatsApp de la cafetería tiene que tener 9 dígitos.' },
      }),
    );

    guardar(elemento);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elemento.textContent).toContain('El WhatsApp de la cafetería tiene que tener');
    expect(club.recargar).not.toHaveBeenCalled();
  });

  it('debajo de los textos van las fotos de cada lugar (T185)', async () => {
    const { elemento } = await montar();

    expect(elemento.querySelector('app-fotos-del-club')?.textContent).toContain('Fotos');
  });

  it('si no carga, lo dice y no deja guardar el formulario en blanco', async () => {
    // Guardar en blanco borraría lo que el sitio ya publica.
    const { elemento } = await montar(() => Promise.reject(new Error('la API no respondió')));

    expect(elemento.textContent).toContain('No se pudo cargar');
    expect(
      elemento.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled,
    ).toBe(true);
  });
});
