import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas } from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { TextosDelSitio } from './textos-del-sitio';

/**
 * T142. Los textos de la página "El club": el titular y la bajada sobre la foto, y el
 * párrafo bajo "Las canchas". Los escribe el club desde su panel.
 */
describe('TextosDelSitio', () => {
  /** El servicio del sitio, falso: el real pide /api/club y estos tests no tienen HTTP. */
  const club = { recargar: vi.fn() };
  beforeEach(() => club.recargar.mockClear());

  const GUARDADOS = {
    elClubTitulo: 'FEDAL Tennis Center',
    elClubBajada: 'Un club de barrio con canchas de torneo.',
    elClubCanchas: 'Todas de superficie dura.',
  };

  const montar = async (configuracion: () => Promise<unknown> = () => Promise.resolve(GUARDADOS)) => {
    const api = {
      configuracion: vi.fn(configuracion),
      fijarTextosDeElClub: vi.fn().mockResolvedValue(GUARDADOS),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminCanchas, useValue: api },
        { provide: Club, useValue: club },
      ],
    });
    const fixture = TestBed.createComponent(TextosDelSitio);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, api, elemento: fixture.nativeElement as HTMLElement };
  };

  // Por su etiqueta, como lo encuentra una persona.
  const campo = (elemento: HTMLElement, etiqueta: string) =>
    Array.from(elemento.querySelectorAll('mat-form-field'))
      .find((l) => l.querySelector('mat-label')?.textContent?.includes(etiqueta))
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
    elemento.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

  it('muestra los tres textos guardados; la bajada y las canchas, en áreas de texto', async () => {
    const { elemento } = await montar();

    expect(campo(elemento, 'Título')?.value).toBe('FEDAL Tennis Center');
    expect(campo(elemento, 'Bajada')?.tagName).toBe('TEXTAREA');
    expect(campo(elemento, 'Bajada')?.value).toBe('Un club de barrio con canchas de torneo.');
    expect(campo(elemento, 'Las canchas')?.value).toBe('Todas de superficie dura.');
  });

  it('no deja escribir más de lo que cabe, y dice cuánto queda', async () => {
    const { elemento } = await montar();
    const titulo = campo(elemento, 'Título')!;

    expect(titulo.maxLength).toBe(80);
    // "FEDAL Tennis Center" son 19: quedan 61. Va en la ayuda, que el lector lee al
    // entrar al campo, y no en una región viva que hablaría con cada letra.
    expect(titulo.closest('mat-form-field')?.textContent).toContain('Quedan 61 caracteres');
  });

  it('al guardar manda los tres textos', async () => {
    const { fixture, api, elemento } = await montar();

    await escribir(fixture, campo(elemento, 'Bajada')!, 'Primera línea.\nSegunda línea.');
    guardar(elemento);
    await fixture.whenStable();

    expect(api.fijarTextosDeElClub).toHaveBeenCalledWith({
      elClubTitulo: 'FEDAL Tennis Center',
      elClubBajada: 'Primera línea.\nSegunda línea.',
      elClubCanchas: 'Todas de superficie dura.',
    });
  });

  it('**al guardar, el sitio vuelve a pedir los textos**: se ven sin recargar', async () => {
    const { fixture, elemento } = await montar();

    guardar(elemento);
    await fixture.whenStable();

    expect(club.recargar).toHaveBeenCalledTimes(1);
  });

  it('**sin título no guarda**, y dice por qué', async () => {
    const { fixture, api, elemento } = await montar();

    await escribir(fixture, campo(elemento, 'Título')!, '   ');
    guardar(elemento);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.fijarTextosDeElClub).not.toHaveBeenCalled();
    expect(elemento.textContent).toContain('El título no puede quedar vacío');
  });

  it('si los textos no cargan, lo dice y no deja guardar el formulario en blanco', async () => {
    // Guardar en blanco borraría la bajada y el texto de las canchas publicados.
    const { elemento } = await montar(() => Promise.reject(new Error('la API no respondió')));

    expect(elemento.textContent).toContain('No se pudieron cargar los textos');
    expect(elemento.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });
});
