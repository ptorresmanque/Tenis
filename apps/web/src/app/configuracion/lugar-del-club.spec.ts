import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas, Lugar } from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { LugarDelClubPanel } from './lugar-del-club';

/**
 * T184 y T236. Cada lugar del club en su pestaña: la tienda, la cafetería y el gimnasio,
 * con su descripción, su horario y su WhatsApp. Las escribe el club desde su panel; el
 * sitio no vende nada. El gimnasio suma el cupo de una clase grupal y sus tarifas.
 */
describe('LugarDelClubPanel', () => {
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
    gimnasioDescripcion: 'Máquinas y pesas.',
    gimnasioHorario: 'Lunes a viernes de 7:00 a 21:00',
    gimnasioWhatsapp: '',
    gimnasioCupoGrupal: 8,
  };

  const montar = async (
    lugar: Lugar = 'TIENDA',
    configuracion: () => Promise<unknown> = () => Promise.resolve(GUARDADOS),
    fijar: () => Promise<unknown> = () => Promise.resolve(GUARDADOS),
  ) => {
    const api = {
      configuracion: vi.fn(configuracion),
      fijarLugar: vi.fn(fijar),
      // Las fotos (T185) y las tarifas (T236) van en sus componentes; acá, sin ninguna.
      fotosDelClub: vi.fn().mockResolvedValue({ TIENDA: [], CAFETERIA: [], GIMNASIO: [] }),
      tarifasDelGimnasio: vi.fn().mockResolvedValue([]),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminCanchas, useValue: api },
        { provide: Club, useValue: club },
      ],
    });
    const fixture = TestBed.createComponent(LugarDelClubPanel);
    fixture.componentRef.setInput('lugar', lugar);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, api, elemento: fixture.nativeElement as HTMLElement };
  };

  /** Un campo del formulario por su etiqueta, como lo busca una persona. */
  const campo = (elemento: HTMLElement, etiqueta: string) =>
    Array.from(elemento.querySelectorAll('form label'))
      .find((l) => l.textContent?.includes(etiqueta))
      ?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');

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
    elemento.querySelector<HTMLButtonElement>('form button[type="submit"]')!.click();

  it('muestra lo guardado de su lugar; la descripción en un área de texto', async () => {
    const { elemento } = await montar();

    expect(campo(elemento, 'Descripción')?.tagName).toBe('TEXTAREA');
    expect(campo(elemento, 'Descripción')?.value).toBe('Raquetas, cuerdas y zapatillas.');
    expect(campo(elemento, 'Horario')?.value).toBe('Lunes a sábado de 9:00 a 20:00');
  });

  it('el WhatsApp lleva el +56 fijo y muestra los 9 dígitos', async () => {
    const { elemento } = await montar();
    const whatsapp = campo(elemento, 'WhatsApp');

    expect(whatsapp?.closest('.campo-con-prefijo')?.textContent).toContain('+56');
    expect(whatsapp?.value.replace(/\D/g, '')).toBe('987654321');
  });

  it('no deja escribir más de lo que cabe, y dice cuánto queda', async () => {
    const { elemento } = await montar('CAFETERIA');
    const descripcion = campo(elemento, 'Descripción')!;

    expect(descripcion.maxLength).toBe(600);
    expect(campo(elemento, 'Horario')!.maxLength).toBe(120);
    expect(descripcion.closest('label')?.textContent).toContain('Quedan 600 caracteres');
  });

  it('**guarda solo lo de su lugar**, con lo que se escribió', async () => {
    const { fixture, api, elemento } = await montar('CAFETERIA');

    await escribir(fixture, campo(elemento, 'Descripción')!, 'Café, jugos y sándwiches.');
    guardar(elemento);
    await fixture.whenStable();

    expect(api.fijarLugar).toHaveBeenCalledWith({
      cafeteriaDescripcion: 'Café, jugos y sándwiches.',
      cafeteriaHorario: '',
      cafeteriaWhatsapp: '',
    });
  });

  it.each([
    ['TIENDA', 'Guardar la tienda'],
    ['CAFETERIA', 'Guardar la cafetería'],
    ['GIMNASIO', 'Guardar el gimnasio'],
  ] as const)('el botón de %s dice qué guarda', async (lugar, texto) => {
    const { elemento } = await montar(lugar);

    expect(elemento.querySelector('form button[type="submit"]')?.textContent?.trim()).toBe(texto);
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
    const { fixture, elemento } = await montar('CAFETERIA', undefined, () =>
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

  it('debajo de los textos van las fotos de su lugar (T185)', async () => {
    const { fixture, elemento } = await montar('CAFETERIA');

    expect(elemento.querySelector('app-fotos-del-club')?.textContent).toContain('Fotos');
    expect(
      fixture.debugElement
        .query((nodo) => nodo.name === 'app-fotos-del-club')
        .componentInstance.lugar(),
    ).toBe('CAFETERIA');
  });

  it('si no carga, lo dice y no deja guardar el formulario en blanco', async () => {
    // Guardar en blanco borraría lo que el sitio ya publica.
    const { elemento } = await montar('TIENDA', () =>
      Promise.reject(new Error('la API no respondió')),
    );

    expect(elemento.textContent).toContain('No se pudo cargar');
    expect(elemento.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(
      true,
    );
  });

  /** T236. El gimnasio suma el cupo de una clase grupal y sus tarifas. */
  describe('el gimnasio', () => {
    it('**guarda el cupo grupal junto con sus textos, como número**', async () => {
      const { fixture, api, elemento } = await montar('GIMNASIO');
      const cupo = campo(elemento, 'Cupo de una clase grupal') as HTMLInputElement;

      expect(cupo.value).toBe('8');
      expect(cupo.min).toBe('2');
      expect(cupo.max).toBe('40');

      await escribir(fixture, cupo, '12');
      guardar(elemento);
      await fixture.whenStable();

      expect(api.fijarLugar).toHaveBeenCalledWith({
        gimnasioDescripcion: 'Máquinas y pesas.',
        gimnasioHorario: 'Lunes a viernes de 7:00 a 21:00',
        gimnasioWhatsapp: '',
        gimnasioCupoGrupal: 12,
      });
    });

    it('**vaciar el cupo y guardar no manda el de antes**: el servidor dice que falta', async () => {
      const { fixture, api, elemento } = await montar('GIMNASIO');

      await escribir(fixture, campo(elemento, 'Cupo de una clase grupal')!, '');
      guardar(elemento);
      await fixture.whenStable();

      expect(api.fijarLugar).toHaveBeenCalledWith(
        expect.objectContaining({ gimnasioCupoGrupal: null }),
      );
    });

    it('lleva el editor de sus tarifas', async () => {
      const { elemento } = await montar('GIMNASIO');

      expect(elemento.querySelector('app-tarifas-del-gimnasio')).not.toBeNull();
    });

    it('la tienda no tiene cupo ni tarifas', async () => {
      const { elemento } = await montar('TIENDA');

      expect(campo(elemento, 'Cupo de una clase grupal')).toBeUndefined();
      expect(elemento.querySelector('app-tarifas-del-gimnasio')).toBeNull();
    });
  });
});
