import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { elegir as elegirOpcion, textosDe } from '../../testing/elegir';
import { Profesores } from '../../clases/profesores.service';
import { Auth, UsuarioActual } from '../../core/auth/auth';
import { Socios } from './socios.service';
import { UsuarioDeLaLista, Usuarios } from './usuarios.service';
import { UsuariosPanel } from './usuarios';
import { responder, textoDelDialogo } from '../../testing/dialogos';
import { avisoDeLoHecho } from '../../testing/snackbar';

/**
 * T223. La lista de usuarios del panel, que reemplaza a Administradores
 * (`SPEC-identidad.md` § Tipos de usuario, criterios 25–27).
 *
 * Lo que este archivo cuida: que la búsqueda la haga el servidor, que los interruptores de
 * admin y gestor guarden al tiro, y que una regla del admin rechazada se lea y deje el
 * interruptor como estaba.
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
  let socios: { invitar: ReturnType<typeof vi.fn> };
  let profesores: {
    listar: ReturnType<typeof vi.fn>;
    crear: ReturnType<typeof vi.fn>;
    vincular: ReturnType<typeof vi.fn>;
    desvincular: ReturnType<typeof vi.fn>;
  };

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const esperar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  /**
   * Admin y Gestor guardan al tocarlos: son interruptores y no casillas (T249, corrección 1 de
   * la auditoría). Un interruptor de Material es un botón con `role="switch"`.
   */
  const interruptor = (tipo: 'admin' | 'gestor', id: number) =>
    el().querySelector<HTMLButtonElement>(`button[role="switch"][name="${tipo}-${id}"]`)!;
  const prendido = (tipo: 'admin' | 'gestor', id: number) =>
    interruptor(tipo, id).getAttribute('aria-checked') === 'true';

  const montar = async (usuarios = LISTA, total = usuarios.length) => {
    api = {
      listar: vi.fn().mockResolvedValue({ usuarios, total, pagina: 1, porPagina: 50 }),
      cambiar: vi.fn().mockResolvedValue({}),
    };
    socios = { invitar: vi.fn().mockResolvedValue({}) };
    profesores = {
      // Una ficha sin cuenta y otra que ya tiene: solo la primera se ofrece.
      listar: vi.fn().mockResolvedValue([
        { id: 9, nombreVisible: 'Profe Sin Cuenta', especialidad: 'Niños', usuarioId: null },
        { id: 8, nombreVisible: 'Profe Con Cuenta', especialidad: 'Niños', usuarioId: 55 },
      ]),
      crear: vi.fn().mockResolvedValue({ id: 10 }),
      vincular: vi.fn().mockResolvedValue({ id: 9 }),
      desvincular: vi.fn().mockResolvedValue({ id: 4 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Usuarios, useValue: api },
        { provide: Socios, useValue: socios },
        { provide: Profesores, useValue: profesores },
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
    expect(prendido('admin', 1)).toBe(true);
    expect(prendido('gestor', 3)).toBe(true);
    expect(prendido('gestor', 2)).toBe(false);
  });

  it('la búsqueda la hace el servidor, desde la primera página', async () => {
    const campo = el().querySelector<HTMLInputElement>('input[name="busqueda"]')!;
    campo.value = 'ana';
    campo.dispatchEvent(new Event('input'));
    el().querySelector<HTMLFormElement>('form[role="search"]')!.dispatchEvent(new Event('submit'));
    await esperar();

    expect(api.listar).toHaveBeenLastCalledWith('ana', 1);
  });

  it('prender gestor guarda al tiro y vuelve a pedir la lista', async () => {
    interruptor('gestor', 2).click();
    await esperar();

    expect(api.cambiar).toHaveBeenCalledWith(2, { esGestor: true });
    expect(api.listar).toHaveBeenCalledTimes(2);
    expect(avisoDeLoHecho()).toContain('Camila Rojas ahora es gestor.');
  });

  it('a uno mismo no le ofrece quitarse el admin: el servidor tampoco lo deja (27)', () => {
    expect(interruptor('admin', 1).disabled).toBe(true);
    expect(interruptor('admin', 2).disabled).toBe(false);
  });

  it('si el servidor rechaza, dice su mensaje y el interruptor vuelve a como estaba (27)', async () => {
    api.cambiar.mockRejectedValue({
      status: 409,
      error: { message: 'Es la última persona con acceso al panel.' },
    });

    interruptor('admin', 2).click();
    await esperar();

    expect(texto()).toContain('Es la última persona con acceso al panel.');
    expect(api.listar).toHaveBeenCalledTimes(2);
    expect(prendido('admin', 2)).toBe(false);
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

  /** T224. Socio y profesor son fichas: se dan desde la fila, con sus propios endpoints. */
  describe('hacer socio y hacer profesor', () => {
    const filaDe = (nombre: string) =>
      [...el().querySelectorAll('main li, li')].find((li) => li.textContent?.includes(nombre))!;
    const apretar = async (dentro: Element, etiqueta: string) => {
      [...dentro.querySelectorAll('button')]
        .find((b) => b.textContent?.trim().startsWith(etiqueta))!
        .click();
      await esperar();
    };
    const escribir = async (dentro: Element, selector: string, valor: string) => {
      // Las listas son de Material (T248): se abren y se elige. La fila abierta es una sola.
      if (selector.startsWith('mat-select')) return elegirOpcion(fixture, selector, valor);

      const campo = dentro.querySelector<HTMLInputElement>(selector)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
      await esperar();
    };

    it('"Hacer socio" manda la invitación con su correo y el número, y recarga (28)', async () => {
      const ana = filaDe('Ana Silva');
      await apretar(ana, 'Hacer socio');
      await escribir(ana, 'input[name="numero-socio"]', '010');
      await apretar(ana, 'Confirmar');

      expect(socios.invitar).toHaveBeenCalledWith({
        email: 'ana@ejemplo.cl',
        numeroSocio: '010',
      });
      expect(api.listar).toHaveBeenCalledTimes(2);
      expect(avisoDeLoHecho()).toContain('Ana Silva ya tiene ficha de socio.');
    });

    it('sin número, el servidor pone el siguiente', async () => {
      const ana = filaDe('Ana Silva');
      await apretar(ana, 'Hacer socio');
      await apretar(ana, 'Confirmar');

      expect(socios.invitar).toHaveBeenCalledWith({ email: 'ana@ejemplo.cl' });
    });

    it('a quien ya es socio no le ofrece "Hacer socio"', () => {
      expect(filaDe('Camila Rojas').textContent).not.toContain('Hacer socio');
    });

    it('"Hacer profesor" ofrece solo las fichas sin cuenta, y vincula la elegida (29)', async () => {
      const camila = filaDe('Camila Rojas');
      await apretar(camila, 'Hacer profesor');

      const opciones = textosDe(fixture, 'mat-select[name="ficha"]');
      expect(opciones).toContain('Profe Sin Cuenta · Niños');
      expect(opciones).not.toContain('Profe Con Cuenta · Niños');

      await escribir(camila, 'mat-select[name="ficha"]', '9');
      await apretar(camila, 'Confirmar');

      expect(profesores.vincular).toHaveBeenCalledWith(9, 2);
      expect(avisoDeLoHecho()).toContain('Camila Rojas ya entra a Clases.');
    });

    it('o crea una ficha nueva con su nombre y su teléfono, y la especialidad que se escriba', async () => {
      const camila = filaDe('Camila Rojas');
      await apretar(camila, 'Hacer profesor');
      await escribir(camila, 'mat-select[name="ficha"]', 'nueva');

      expect(camila.querySelector<HTMLInputElement>('input[name="nombre-visible"]')!.value).toBe(
        'Camila Rojas',
      );
      await escribir(camila, 'input[name="especialidad"]', 'Competitivo');
      await apretar(camila, 'Confirmar');

      expect(profesores.crear).toHaveBeenCalledWith(
        {
          nombreVisible: 'Camila Rojas',
          telefono: '56911112222',
          especialidad: 'Competitivo',
          tarifaHoraClp: null,
        },
        2,
      );
    });

    it('"Quitar profesor" pregunta antes, y desvincula sin borrar la ficha (30)', async () => {
      await apretar(filaDe('Ana Silva'), 'Quitar profesor');

      // La pregunta es un diálogo (T253), con la pregunta de título.
      expect(textoDelDialogo()).toContain('¿Quitarle Clases a Ana Silva?');
      expect(textoDelDialogo()).toContain('La ficha y sus clases quedan');
      expect(profesores.desvincular).not.toHaveBeenCalled();

      await responder(fixture, true);

      expect(profesores.desvincular).toHaveBeenCalledWith(4);
      expect(avisoDeLoHecho()).toContain('Ana Silva ya no entra a Clases.');
    });

    it('descartar «Quitar profesor» no desvincula', async () => {
      await apretar(filaDe('Ana Silva'), 'Quitar profesor');
      await responder(fixture, false);

      expect(profesores.desvincular).not.toHaveBeenCalled();
    });

    it('si otro ya vinculó esa ficha, dice el 409', async () => {
      profesores.vincular.mockRejectedValue({
        status: 409,
        error: { message: 'Esta ficha ya tiene una cuenta.' },
      });
      const camila = filaDe('Camila Rojas');
      await apretar(camila, 'Hacer profesor');
      await escribir(camila, 'mat-select[name="ficha"]', '9');
      await apretar(camila, 'Confirmar');

      expect(texto()).toContain('Esta ficha ya tiene una cuenta.');
    });
  });
});
