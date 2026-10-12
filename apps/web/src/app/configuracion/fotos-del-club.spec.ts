import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas } from '../catalogo-canchas/admin/admin-canchas.service';
import { Club, FotoDelLugar } from '../club/club.service';
import { FotosDelClubPanel } from './fotos-del-club';

/**
 * T185. Las fotos de la tienda y la cafetería: hasta seis por lugar, la primera es la de
 * la portada. Se suben con un texto alternativo y se borran con confirmación.
 */
describe('FotosDelClubPanel', () => {
  /** El servicio del sitio, falso: el real pide /api/club y estos tests no tienen HTTP. */
  const club = { recargar: vi.fn() };
  beforeEach(() => club.recargar.mockClear());

  const foto = (id: number, descripcion: string | null = null): FotoDelLugar => ({
    id,
    descripcion,
    miniatura: `/api/club/fotos/${id}/miniatura`,
    imagen: `/api/club/fotos/${id}/imagen`,
  });

  const montar = async (
    fotos: { TIENDA: FotoDelLugar[]; CAFETERIA: FotoDelLugar[] } = {
      TIENDA: [foto(1, 'La vitrina de raquetas'), foto(2)],
      CAFETERIA: [],
    },
    subir: () => Promise<unknown> = () => Promise.resolve(foto(9)),
  ) => {
    const api = {
      fotosDelClub: vi.fn(() => Promise.resolve(fotos)),
      subirFotoDelClub: vi.fn(subir),
      quitarFotoDelClub: vi.fn(() => Promise.resolve()),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminCanchas, useValue: api },
        { provide: Club, useValue: club },
      ],
    });
    const fixture = TestBed.createComponent(FotosDelClubPanel);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, api, elemento: fixture.nativeElement as HTMLElement };
  };

  /** El bloque de un lugar, por su título. */
  const bloque = (elemento: HTMLElement, lugar: string) =>
    Array.from(elemento.querySelectorAll('section')).find((s) =>
      s.querySelector('h3')?.textContent?.includes(lugar),
    )!;

  const boton = (raiz: HTMLElement, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(texto),
    );

  const elegirArchivo = async (
    fixture: { whenStable: () => Promise<unknown>; detectChanges: () => void },
    raiz: HTMLElement,
  ) => {
    const entrada = raiz.querySelector<HTMLInputElement>('input[type="file"]')!;
    const archivo = new File(['foto'], 'cafe.jpg', { type: 'image/jpeg' });
    Object.defineProperty(entrada, 'files', { value: [archivo] });
    entrada.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    return archivo;
  };

  it('muestra las miniaturas de cada lugar, con su texto o uno por omisión', async () => {
    const { elemento } = await montar();
    const imagenes = bloque(elemento, 'Tienda').querySelectorAll('img');

    expect(imagenes).toHaveLength(2);
    expect(imagenes[0].getAttribute('src')).toBe('/api/club/fotos/1/miniatura');
    expect(imagenes[0].alt).toBe('La vitrina de raquetas');
    expect(imagenes[1].alt).toBe('Foto de la tienda del club');
    expect(bloque(elemento, 'Cafetería').textContent).toContain('Todavía no tiene fotos');
  });

  it('dice que la primera es la de la portada', async () => {
    const { elemento } = await montar();

    expect(bloque(elemento, 'Tienda').textContent).toContain('portada');
  });

  it('sube la foto elegida con su texto, y el sitio vuelve a pedir los datos', async () => {
    const { fixture, api, elemento } = await montar();
    const cafeteria = bloque(elemento, 'Cafetería');
    const archivo = await elegirArchivo(fixture, cafeteria);
    const texto = cafeteria.querySelector<HTMLInputElement>('input[type="text"]')!;

    texto.value = '  La barra del café  ';
    texto.dispatchEvent(new Event('input'));
    boton(cafeteria, 'Subir la foto')!.click();
    await fixture.whenStable();

    expect(api.subirFotoDelClub).toHaveBeenCalledWith('CAFETERIA', archivo, 'La barra del café');
    expect(api.fotosDelClub).toHaveBeenCalledTimes(2);
    expect(club.recargar).toHaveBeenCalledTimes(1);
  });

  it('**con seis fotos no deja subir otra**, y dice por qué', async () => {
    const llena = [1, 2, 3, 4, 5, 6].map((id) => foto(id));
    const { elemento } = await montar({ TIENDA: llena, CAFETERIA: [] });
    const tienda = bloque(elemento, 'Tienda');

    expect(tienda.textContent).toContain('Ya tiene seis fotos');
    expect(tienda.querySelector<HTMLInputElement>('input[type="file"]')).toBeNull();
    expect(bloque(elemento, 'Cafetería').querySelector('input[type="file"]')).not.toBeNull();
  });

  it('**borrar pide confirmación** y después borra', async () => {
    const { fixture, api, elemento } = await montar();
    const tienda = bloque(elemento, 'Tienda');

    boton(tienda, 'Borrar')!.click();
    fixture.detectChanges();

    expect(api.quitarFotoDelClub).not.toHaveBeenCalled();

    boton(tienda, 'Sí, borrar')!.click();
    await fixture.whenStable();

    expect(api.quitarFotoDelClub).toHaveBeenCalledWith(1);
    expect(club.recargar).toHaveBeenCalledTimes(1);
  });

  it('si la API rechaza la foto, muestra su mensaje en el bloque de ese lugar', async () => {
    const { fixture, elemento } = await montar(undefined, () =>
      Promise.reject({ error: { message: 'Ese archivo no es una imagen que podamos leer.' } }),
    );
    const cafeteria = bloque(elemento, 'Cafetería');

    await elegirArchivo(fixture, cafeteria);
    boton(cafeteria, 'Subir la foto')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cafeteria.textContent).toContain('Ese archivo no es una imagen');
    expect(bloque(elemento, 'Tienda').textContent).not.toContain('Ese archivo');
  });
});
