import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { FichaDeTour, Tours } from '../tours.service';
import { FichaTour } from './ficha-tour';

/**
 * T191. La ficha de un tour en el panel. Esta tarea hace la pestaña **Datos**: el nombre,
 * la descripción y la imagen representativa. Borrar pide confirmación en un `dialog`.
 */
describe('FichaTour', () => {
  const FICHA: FichaDeTour = {
    id: 3,
    nombre: 'Tour FEDAL',
    descripcion: 'La liga del club.',
    imagen: null,
    temporadas: [],
    fotos: [],
  };

  const montar = async (
    ficha: () => Promise<FichaDeTour> = () => Promise.resolve(FICHA),
    extra: Partial<Record<'editar' | 'borrar' | 'subirImagen', () => Promise<unknown>>> = {},
  ) => {
    const api = {
      ficha: vi.fn(ficha),
      editar: vi.fn(extra.editar ?? (() => Promise.resolve(FICHA))),
      borrar: vi.fn(extra.borrar ?? (() => Promise.resolve({ id: 3 }))),
      subirImagen: vi.fn(
        extra.subirImagen ??
          (() => Promise.resolve({ miniatura: '/api/tours/3/miniatura', web: '/api/tours/3/imagen' })),
      ),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Tours, useValue: api }],
    });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(FichaTour);
    fixture.componentRef.setInput('id', '3');
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, api, navegar, elemento: fixture.nativeElement as HTMLElement };
  };

  const campo = (elemento: HTMLElement, etiqueta: string) =>
    Array.from(elemento.querySelectorAll('mat-form-field'))
      .find((l) => l.querySelector('mat-label')?.textContent?.includes(etiqueta))
      ?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');

  const boton = (elemento: HTMLElement, texto: string) =>
    Array.from(elemento.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(texto),
    );

  const escribir = async (
    fixture: { whenStable: () => Promise<unknown> },
    control: HTMLInputElement | HTMLTextAreaElement,
    valor: string,
  ) => {
    control.value = valor;
    control.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  it('el nombre del tour es el titular, y la pestaña Datos está elegida', async () => {
    const { elemento } = await montar();

    expect(elemento.querySelector('h1')?.textContent).toContain('Tour FEDAL');
    expect(
      elemento.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toContain('Datos');
  });

  it('muestra el nombre y la descripción guardados, con cuánto queda', async () => {
    const { elemento } = await montar();

    expect(campo(elemento, 'Nombre')?.value).toBe('Tour FEDAL');
    expect(campo(elemento, 'Descripción')?.tagName).toBe('TEXTAREA');
    expect(campo(elemento, 'Descripción')?.value).toBe('La liga del club.');
    expect(campo(elemento, 'Nombre')?.maxLength).toBe(80);
    expect(campo(elemento, 'Descripción')?.closest('mat-form-field')?.textContent).toContain(
      'Quedan 1983 caracteres',
    );
  });

  it('al guardar manda el nombre y la descripción', async () => {
    const { fixture, api, elemento } = await montar();

    await escribir(fixture, campo(elemento, 'Descripción')!, 'Primera línea.\nSegunda.');
    boton(elemento, 'Guardar los datos')!.click();
    await fixture.whenStable();

    expect(api.editar).toHaveBeenCalledWith(3, {
      nombre: 'Tour FEDAL',
      descripcion: 'Primera línea.\nSegunda.',
    });
  });

  it('sin imagen lo dice; al subir una, la muestra con una dirección nueva', async () => {
    // La API, como la de verdad: después de subir, la ficha trae la imagen.
    let actual = FICHA;
    const imagen = { miniatura: '/api/tours/3/miniatura', web: '/api/tours/3/imagen' };
    const { fixture, api, elemento } = await montar(() => Promise.resolve(actual), {
      subirImagen: () => {
        actual = { ...FICHA, imagen };
        return Promise.resolve(imagen);
      },
    });

    expect(elemento.textContent).toContain('Todavía no tiene imagen');

    const entrada = elemento.querySelector<HTMLInputElement>('input[type="file"]')!;
    const archivo = new File(['afiche'], 'afiche.jpg', { type: 'image/jpeg' });
    Object.defineProperty(entrada, 'files', { value: [archivo] });
    entrada.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.subirImagen).toHaveBeenCalledWith(3, archivo);
    await fixture.whenStable();
    fixture.detectChanges();
    // La dirección de la imagen es la del tour: sin la versión, el navegador seguiría
    // mostrando la anterior.
    expect(elemento.querySelector('img')?.getAttribute('src')).toMatch(
      /^\/api\/tours\/3\/miniatura\?v=\d+$/,
    );
  });

  /** El diálogo es de Material (T252): se dibuja en el contenedor de overlays, no en la ficha. */
  const dialogo = () => document.querySelector<HTMLElement>('mat-dialog-container');

  it('**borrar pide confirmación**, y al confirmar vuelve a la lista', async () => {
    const { fixture, api, navegar, elemento } = await montar();

    boton(elemento, 'Borrar el tour')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dialogo()?.textContent).toContain('se borra con sus temporadas');
    expect(api.borrar).not.toHaveBeenCalled();

    boton(dialogo()!, 'Sí, borrar')!.click();
    await fixture.whenStable();

    expect(api.borrar).toHaveBeenCalledWith(3);
    expect(navegar).toHaveBeenCalledWith(['/administracion/tours']);
  });

  it('**con torneos, el mensaje de la API se ve** y no navega', async () => {
    const { fixture, navegar, elemento } = await montar(undefined, {
      borrar: () =>
        Promise.reject({
          status: 409,
          error: { message: 'Ese tour suma para 2 torneos. Quítaselos antes de borrarlo.' },
        }),
    });
    boton(elemento, 'Borrar el tour')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    boton(dialogo()!, 'Sí, borrar')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // La pregunta se cierra y el mensaje queda en la ficha.
    expect(elemento.textContent).toContain('Ese tour suma para 2 torneos');
    expect(dialogo()).toBeNull();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('**al pasar a otro tour, lo escrito en el anterior no se arrastra**', async () => {
    const { fixture, elemento } = await montar((): Promise<FichaDeTour> =>
      Promise.resolve(FICHA),
    );

    await escribir(fixture, campo(elemento, 'Descripción')!, 'A medio escribir.');
    fixture.componentRef.setInput('id', '4');
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(campo(elemento, 'Descripción')?.value).toBe('La liga del club.');
  });

  it('**la pestaña Temporadas** muestra sus temporadas, y lo que cambia ahí recarga la ficha', async () => {
    const { fixture, api, elemento } = await montar();

    Array.from(elemento.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((b) => b.textContent?.includes('Temporadas'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();

    const pestana = elemento.querySelector('app-temporadas-del-tour');
    expect(pestana).not.toBeNull();
    expect(elemento.querySelector('textarea[name="descripcion"]')).toBeNull();

    const antes = api.ficha.mock.calls.length;
    (fixture.debugElement.query((n) => n.name === 'app-temporadas-del-tour')
      .componentInstance as { cambio: { emit: () => void } }).cambio.emit();
    await fixture.whenStable();

    expect(api.ficha.mock.calls.length).toBe(antes + 1);
  });

  it('**la pestaña Galería** muestra la galería del tour', async () => {
    const { fixture, elemento } = await montar();

    Array.from(elemento.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((b) => b.textContent?.includes('Galería'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elemento.querySelector('app-galeria-del-tour')).not.toBeNull();
    expect(elemento.querySelector('textarea[name="descripcion"]')).toBeNull();
  });

  it('un tour que no existe lo dice, con el enlace de vuelta', async () => {
    const { elemento } = await montar(() => Promise.reject({ status: 404 }));

    expect(elemento.textContent).toContain('No se pudo cargar el tour');
    expect(elemento.querySelector('a[href="/administracion/tours"]')).not.toBeNull();
  });
});
