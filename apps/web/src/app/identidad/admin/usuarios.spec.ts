import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Auth, UsuarioActual } from '../../core/auth/auth';
import { UsuarioDeLaLista, Usuarios } from './usuarios.service';
import { UsuariosPanel } from './usuarios';

/**
 * T223. La lista de usuarios del panel, que reemplaza a Administradores
 * (`SPEC-identidad.md` § Tipos de usuario, criterios 25–27).
 *
 * Lo que este archivo cuida: que la búsqueda la haga el servidor, que las casillas de
 * admin y gestor guarden al tiro, y que una regla del admin rechazada se lea y deje la
 * casilla como estaba.
 */
describe('UsuariosPanel', () => {
  const YO: UsuarioActual = {
    id: 1,
    nombre: 'Rodrigo',
    apellido: 'Torres',
    email: 'admin@clubdetenis.cl',
    telefono: null,
    esAdmin: true,
    esGestor: false,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };

  const fila = (parche: Partial<UsuarioDeLaLista>): UsuarioDeLaLista => ({
    id: 2,
    nombre: 'Camila',
    apellido: 'Rojas',
    email: 'camila@ejemplo.cl',
    telefono: '56911112222',
    creadoEn: '2026-03-02T15:00:00.000Z',
    esAdmin: false,
    esGestor: false,
    socio: null,
    profesor: null,
    ...parche,
  });

  const LISTA = [
    fila({
      id: 1,
      nombre: 'Rodrigo',
      apellido: 'Torres',
      email: 'admin@clubdetenis.cl',
      esAdmin: true,
    }),
    fila({ id: 2, socio: { id: 7, numeroSocio: '001', estado: 'ACTIVO' } }),
    fila({
      id: 3,
      nombre: 'Ana',
      apellido: 'Silva',
      email: 'ana@ejemplo.cl',
      esGestor: true,
      profesor: { id: 4, nombreVisible: 'Ana Silva', activo: true },
    }),
  ];

  let fixture: ComponentFixture<UsuariosPanel>;
  let api: { listar: ReturnType<typeof vi.fn>; cambiar: ReturnType<typeof vi.fn> };

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const esperar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const casilla = (tipo: 'admin' | 'gestor', id: number) =>
    el().querySelector<HTMLInputElement>(`input[name="${tipo}-${id}"]`)!;

  const montar = async (usuarios = LISTA, total = usuarios.length) => {
    api = {
      listar: vi.fn().mockResolvedValue({ usuarios, total, pagina: 1, porPagina: 50 }),
      cambiar: vi.fn().mockResolvedValue({}),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Usuarios, useValue: api },
        { provide: Auth, useValue: { usuario: signal(YO).asReadonly() } },
      ],
    });

    fixture = TestBed.createComponent(UsuariosPanel);
    await esperar();
  };

  beforeEach(async () => {
    await montar();
  });

  it('lista a cada uno con su correo, su teléfono y sus tipos', () => {
    expect(api.listar).toHaveBeenCalledWith('', 1);
    expect(texto()).toContain('Camila Rojas');
    expect(texto()).toContain('camila@ejemplo.cl');
    expect(texto()).toContain('Socio N° 001');
    expect(texto()).toContain('Profesor');
    expect(casilla('admin', 1).checked).toBe(true);
    expect(casilla('gestor', 3).checked).toBe(true);
    expect(casilla('gestor', 2).checked).toBe(false);
  });

  it('la búsqueda la hace el servidor, desde la primera página', async () => {
    const campo = el().querySelector<HTMLInputElement>('input[name="busqueda"]')!;
    campo.value = 'ana';
    campo.dispatchEvent(new Event('input'));
    el().querySelector<HTMLFormElement>('form[role="search"]')!.dispatchEvent(new Event('submit'));
    await esperar();

    expect(api.listar).toHaveBeenLastCalledWith('ana', 1);
  });

  it('marcar gestor guarda al tiro y vuelve a pedir la lista', async () => {
    casilla('gestor', 2).click();
    await esperar();

    expect(api.cambiar).toHaveBeenCalledWith(2, { esGestor: true });
    expect(api.listar).toHaveBeenCalledTimes(2);
    expect(texto()).toContain('Camila Rojas ahora es gestor.');
  });

  it('a uno mismo no le ofrece quitarse el admin: el servidor tampoco lo deja (27)', () => {
    expect(casilla('admin', 1).disabled).toBe(true);
    expect(casilla('admin', 2).disabled).toBe(false);
  });

  it('si el servidor rechaza, dice su mensaje y la casilla vuelve a como estaba (27)', async () => {
    api.cambiar.mockRejectedValue({
      status: 409,
      error: { message: 'Es la última persona con acceso al panel.' },
    });

    casilla('admin', 2).click();
    await esperar();

    expect(texto()).toContain('Es la última persona con acceso al panel.');
    expect(api.listar).toHaveBeenCalledTimes(2);
    expect(casilla('admin', 2).checked).toBe(false);
  });

  it('de a 50: dice cuántos son y pasa de página', async () => {
    await montar(LISTA, 120);

    expect(texto()).toContain('120 usuarios');
    expect(texto()).toContain('Página 1 de 3');

    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes('Siguiente'))!.click();
    await esperar();

    expect(api.listar).toHaveBeenLastCalledWith('', 2);
  });

  it('la fila de un socio lleva a Socios', () => {
    const enlace = el().querySelector<HTMLAnchorElement>('a[href="/administracion/socios"]');

    expect(enlace?.textContent).toContain('Socio N° 001');
  });

  it('sin resultados lo dice', async () => {
    await montar([], 0);

    expect(texto()).toContain('No hay usuarios con esa búsqueda.');
  });
});
