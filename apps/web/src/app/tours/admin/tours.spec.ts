import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { Tours, TourEnLista } from '../tours.service';
import { ToursPanel } from './tours';

/**
 * T191. La lista de tours del panel: cada uno con cuántas temporadas tiene, y un
 * formulario para crear uno con solo el nombre. Lo demás se completa en su ficha. Desde T292
 * el formulario es un diálogo que abre el FAB «Nuevo tour».
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

  /** El diálogo de alta, que Material dibuja fuera del componente (T292). */
  const dialogo = () => document.querySelector<HTMLElement>('mat-dialog-container');

  /** Abre el diálogo con el FAB, escribe el nombre y lo manda. */
  const crearConNombre = async (fixture: ComponentFixture<ToursPanel>, nombre: string) => {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.mat-mdc-fab-base')!.click();
    await fixture.whenStable();
    // NgForm conecta el campo un microtask después de crearlo: antes, escribir no llega.
    await Promise.resolve();
    const campo = dialogo()!.querySelector<HTMLInputElement>('input[name="nombre"]')!;
    campo.value = nombre;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    dialogo()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  };

  it('**«Nuevo tour» es el único FAB, y la cabecera ya no tiene acción** (T292)', async () => {
    const { elemento } = await montar();
    const fabs = elemento.querySelectorAll('.mat-mdc-fab-base');

    expect(fabs.length).toBe(1);
    expect(fabs[0].textContent).toContain('Nuevo tour');
    expect(elemento.querySelector('.cabecera-panel')?.querySelectorAll('button, a').length).toBe(0);
    expect(elemento.querySelector('form')).toBeNull();
    // Espacio al final para que el FAB no tape el último tour (A9).
    expect(elemento.classList).toContain('pb-24');
  });

  it('**crea un tour con solo el nombre y abre su ficha**, para completar el resto', async () => {
    const { fixture, api, navegar } = await montar();

    await crearConNombre(fixture, 'Tour Juvenil');
    await vi.waitFor(() => expect(navegar).toHaveBeenCalledWith(['/administracion/tours', 7]));

    expect(api.crear).toHaveBeenCalledWith('Tour Juvenil');
  });

  it('si el nombre ya existe, muestra el mensaje de la API en el diálogo y no navega', async () => {
    const { fixture, navegar } = await montar(undefined, () =>
      Promise.reject({ status: 409, error: { message: 'Ya hay un tour con ese nombre.' } }),
    );

    await crearConNombre(fixture, 'Tour FEDAL');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialogo()?.textContent).toContain('Ya hay un tour con ese nombre.');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('el botón de crear gira mientras viaja (T153), y el diálogo no se cierra', async () => {
    let soltar!: (valor: unknown) => void;
    const { fixture } = await montar(undefined, () => new Promise((r) => (soltar = r)));

    await crearConNombre(fixture, 'Tour Juvenil');
    await fixture.whenStable();

    expect(dialogo()?.querySelector('button[type="submit"]')?.getAttribute('aria-busy')).toBe(
      'true',
    );
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await fixture.whenStable();
    expect(dialogo()).not.toBeNull();
    soltar({ id: 7 });
  });
});
