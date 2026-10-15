import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { ListadoDeUsuarios, UsuarioDeLaLista, Usuarios } from '../usuarios.service';
import { PersonasPanel } from './personas';

/**
 * T296 (SPEC-panel.md D2 y A4). Socios, Usuarios y Profesores en una sola tabla de cuentas: con
 * chips de filtro por tipo, búsqueda, orden y paginación en el servidor. Lo elegido viaja en la
 * URL, así un enlace a «Personas · Socios» se comparte y las rutas viejas llegan con su filtro.
 * **Sin FAB**: nadie se crea desde acá (D12).
 */
describe('Personas', () => {
  const ANA: UsuarioDeLaLista = {
    id: 7,
    nombre: 'Ana',
    apellido: 'Rojas',
    email: 'ana@ejemplo.cl',
    telefono: null,
    creadoEn: '2026-01-10T12:00:00.000Z',
    esAdmin: false,
    esGestor: true,
    socio: { id: 3, numeroSocio: '012', estado: 'ACTIVO', alDiaHasta: '2099-12-31T00:00:00.000Z' },
    profesor: { id: 4, nombreVisible: 'Ana Rojas', activo: true },
  };
  const BETO: UsuarioDeLaLista = {
    ...ANA,
    id: 8,
    nombre: 'Beto',
    apellido: 'Soto',
    email: 'beto@ejemplo.cl',
    esGestor: false,
    socio: { id: 5, numeroSocio: '013', estado: 'ACTIVO', alDiaHasta: '2020-01-31T00:00:00.000Z' },
    profesor: null,
  };
  const CARLA: UsuarioDeLaLista = {
    ...ANA,
    id: 9,
    nombre: 'Carla',
    apellido: 'Pérez',
    email: 'carla@ejemplo.cl',
    esGestor: false,
    socio: null,
    profesor: null,
  };

  const montar = async (
    url: { tipo?: string; q?: string; orden?: string; pagina?: string } = {},
    listado: Partial<ListadoDeUsuarios> = {},
  ) => {
    const listar = vi.fn().mockResolvedValue({
      usuarios: [ANA, BETO, CARLA],
      total: 3,
      pagina: 1,
      porPagina: 50,
      profesoresSinCuenta: 0,
      ...listado,
    });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Usuarios, useValue: { listar } }],
    });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(PersonasPanel);
    // Lo que trae la URL: el router se lo da como inputs.
    for (const [nombre, valor] of Object.entries(url)) fixture.componentRef.setInput(nombre, valor);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, listar, navegar };
  };

  /** Lo que se pidió que cambie en la URL, sin el resto de las opciones. */
  const cambioEnLaUrl = (navegar: ReturnType<typeof vi.spyOn>) =>
    (navegar.mock.lastCall![1] as { queryParams: object }).queryParams;

  it('se titula como su ítem del menú, y **no tiene FAB**: nadie se crea desde acá', async () => {
    const { el } = await montar();

    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Personas');
    expect(el.querySelector('.mat-mdc-fab-base')).toBeNull();
  });

  it('**pide a la API lo que dice la URL**: tipo, búsqueda, orden y página', async () => {
    const { listar } = await montar({ tipo: 'socios', q: 'ana', orden: 'numero', pagina: '2' });

    expect(listar).toHaveBeenCalledWith('ana', 2, 'socios', 'numero');
  });

  it('lo que no se entiende en la URL vale por lo de siempre', async () => {
    const { listar } = await montar({ tipo: 'amigos', orden: 'edad', pagina: 'cero' });

    expect(listar).toHaveBeenCalledWith('', 1, undefined, 'nombre');
  });

  it('**los chips filtran por tipo**, y filtrar vuelve a la primera página', async () => {
    const { el, fixture, navegar } = await montar({ pagina: '3' });
    const chips = [...el.querySelectorAll<HTMLElement>('mat-chip-option')];

    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      'Todos',
      'Socios',
      'Profesores',
      'Gestores',
      'Administradores',
      'Sin tipo',
    ]);
    chips[1].querySelector<HTMLElement>('button')!.click();
    fixture.detectChanges();

    expect(cambioEnLaUrl(navegar)).toEqual({ tipo: 'socios', pagina: null });
  });

  it('buscar y ordenar también van a la URL', async () => {
    const { el, fixture, navegar } = await montar();
    const campo = el.querySelector<HTMLInputElement>('input[name="busqueda"]')!;

    // NgForm conecta el campo un microtask después de crearlo: antes, escribir no llega.
    await Promise.resolve();
    campo.value = 'rojas';
    campo.dispatchEvent(new Event('input'));
    el.querySelector<HTMLFormElement>('form[role="search"]')!.dispatchEvent(new Event('submit'));
    expect(cambioEnLaUrl(navegar)).toEqual({ q: 'rojas', pagina: null });

    [...el.querySelectorAll<HTMLElement>('mat-button-toggle button')]
      .find((boton) => boton.textContent?.includes('N° de socio'))!
      .click();
    fixture.detectChanges();
    expect(cambioEnLaUrl(navegar)).toEqual({ orden: 'numero', pagina: null });
  });

  it('**una fila por cuenta**: su nombre lleva a su ficha, con su correo, sus tipos y su cuota', async () => {
    const { el } = await montar();
    const filas = [...el.querySelectorAll<HTMLElement>('tr[mat-row]')];
    const [ana, beto, carla] = filas.map((fila) => fila.textContent!.replace(/\s+/g, ' '));

    expect(filas[0].querySelector('a')?.getAttribute('href')).toBe('/administracion/personas/7');
    expect(ana).toContain('ana@ejemplo.cl');
    expect(ana).toContain('Socio N° 012');
    expect(ana).toContain('Profesor');
    expect(ana).toContain('Gestor');
    expect(ana).toContain('Al día');
    expect(beto).toContain('Cuota vencida');
    expect(carla).toContain('—');
  });

  it('la tabla tiene su nombre para el lector', async () => {
    const { el } = await montar();

    expect(el.querySelector('table')?.getAttribute('aria-label')).toBe('Personas del club');
  });

  it('**pagina en el servidor**: más de 50, el paginador; cambiar de página va a la URL', async () => {
    const { el, fixture, navegar } = await montar({}, { total: 120 });

    el.querySelector<HTMLButtonElement>('button.mat-mdc-paginator-navigation-next')!.click();
    fixture.detectChanges();

    expect(cambioEnLaUrl(navegar)).toEqual({ pagina: 2 });
  });

  it('sin más de una página no hay paginador', async () => {
    const { el } = await montar();

    expect(el.querySelector('mat-paginator')).toBeNull();
  });

  it('**con el filtro Profesores, avisa cuántos siguen sin cuenta** (D14), solo si hay', async () => {
    const conDos = (await montar({ tipo: 'profesores' }, { profesoresSinCuenta: 2 })).el;
    expect(conDos.textContent).toContain('2 profesores siguen sin cuenta');

    TestBed.resetTestingModule();
    const enSocios = (await montar({ tipo: 'socios' }, { profesoresSinCuenta: 2 })).el;
    expect(enSocios.textContent).not.toContain('sin cuenta');

    TestBed.resetTestingModule();
    const sinNinguno = (await montar({ tipo: 'profesores' }, { profesoresSinCuenta: 0 })).el;
    expect(sinNinguno.textContent).not.toContain('sin cuenta');
  });

  it('si nadie coincide, lo dice', async () => {
    const { el } = await montar({ q: 'zzz' }, { usuarios: [], total: 0 });

    expect(el.textContent).toContain('Nadie coincide');
  });
});
