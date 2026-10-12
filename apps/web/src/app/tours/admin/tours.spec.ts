import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { Tours, TourEnLista } from '../tours.service';
import { ToursPanel } from './tours';

/**
 * T191. La lista de tours del panel: cada uno con cuántas temporadas tiene, y un
 * formulario para crear uno con solo el nombre. Lo demás se completa en su ficha.
 */
describe('ToursPanel', () => {
  const TOURS: TourEnLista[] = [
    { id: 1, nombre: 'Tour FEDAL', temporadas: 2 },
    { id: 2, nombre: 'Tour Senior', temporadas: 0 },
  ];

  const montar = async (
    listar: () => Promise<TourEnLista[]> = () => Promise.resolve(TOURS),
    crear: () => Promise<unknown> = () => Promise.resolve({ id: 7 }),
  ) => {
    const api = { listar: vi.fn(listar), crear: vi.fn(crear) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Tours, useValue: api }],
    });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ToursPanel);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, api, navegar, elemento: fixture.nativeElement as HTMLElement };
  };

  const boton = (elemento: HTMLElement, texto: string) =>
    Array.from(elemento.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(texto),
    )!;

  it('lista los tours con un enlace a su ficha y cuántas temporadas tiene', async () => {
    const { elemento } = await montar();
    const enlace = elemento.querySelector<HTMLAnchorElement>('a[href="/administracion/tours/1"]');

    expect(enlace?.textContent).toContain('Tour FEDAL');
    expect(elemento.textContent).toContain('2 temporadas');
    expect(elemento.textContent).toContain('Sin temporadas');
  });

  it('sin tours, dice cómo empezar', async () => {
    const { elemento } = await montar(() => Promise.resolve([]));

    expect(elemento.textContent).toContain('Todavía no hay tours');
  });

  it('si la lista no carga, lo dice', async () => {
    const { elemento } = await montar(() => Promise.reject(new Error('caída')));

    expect(elemento.textContent).toContain('No se pudieron cargar los tours');
  });

  it('**crea un tour con solo el nombre y abre su ficha**, para completar el resto', async () => {
    const { fixture, api, navegar, elemento } = await montar();

    boton(elemento, 'Crear tour').click();
    fixture.detectChanges();
    await fixture.whenStable();
    const nombre = elemento.querySelector<HTMLInputElement>('input[name="nombre"]')!;
    nombre.value = 'Tour Juvenil';
    nombre.dispatchEvent(new Event('input'));
    elemento.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(api.crear).toHaveBeenCalledWith('Tour Juvenil');
    expect(navegar).toHaveBeenCalledWith(['/administracion/tours', 7]);
  });

  it('si el nombre ya existe, muestra el mensaje de la API y no navega', async () => {
    const { fixture, navegar, elemento } = await montar(undefined, () =>
      Promise.reject({ status: 409, error: { message: 'Ya hay un tour con ese nombre.' } }),
    );

    boton(elemento, 'Crear tour').click();
    fixture.detectChanges();
    await fixture.whenStable();
    const nombre = elemento.querySelector<HTMLInputElement>('input[name="nombre"]')!;
    nombre.value = 'Tour FEDAL';
    nombre.dispatchEvent(new Event('input'));
    elemento.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elemento.textContent).toContain('Ya hay un tour con ese nombre.');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('el botón de crear gira mientras viaja (T153)', async () => {
    let soltar!: (valor: unknown) => void;
    const { fixture, elemento } = await montar(undefined, () => new Promise((r) => (soltar = r)));

    boton(elemento, 'Crear tour').click();
    fixture.detectChanges();
    await fixture.whenStable();
    const nombre = elemento.querySelector<HTMLInputElement>('input[name="nombre"]')!;
    nombre.value = 'Tour Juvenil';
    nombre.dispatchEvent(new Event('input'));
    elemento.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(
      elemento.querySelector('form button[type="submit"]')?.getAttribute('aria-busy'),
    ).toBe('true');
    soltar({ id: 7 });
  });
});
