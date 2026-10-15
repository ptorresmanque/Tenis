import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { elegir as elegirOpcion, textosDe } from '../../testing/elegir';
import { HoraAfectada } from '../../catalogo-canchas/admin/admin-canchas.service';
import { Disponibilidad } from '../../catalogo-canchas/disponibilidad';
import { Auth, UsuarioActual } from '../../core/auth/auth';
import { Clases } from '../clases.service';
import { Profesores } from '../profesores.service';
import { AgendarClase } from './agendar-clase';
import { avisoDeLoHecho } from '../../testing/snackbar';

/**
 * T46. Agendar una clase es cerrar la cancha, y esta pantalla lo trata como tal.
 *
 * Lo que este archivo cuida: que **con horas tomadas debajo no se agende de una**.
 * El admin ve a quién le va a quitar la hora y recién ahí decide. Sin ese paso,
 * cancelar reservas automáticamente es un descuido esperando ocurrir.
 *
 * Desde T294 agendar es su propia página, adonde lleva el FAB de Clases con el día, y al
 * agendar se vuelve a ese día.
 */
describe('AgendarClase', () => {
  const TOMADA: HoraAfectada = {
    id: 3,
    folio: 'AB23CDE',
    inicio: '2026-08-17T21:00:00.000Z',
    fin: '2026-08-17T22:00:00.000Z',
    nombre: 'Camila Socia',
    email: 'camila@ejemplo.cl',
    esSocio: true,
    pagada: false,
    pagoEnCurso: false,
  };

  const ADMIN: UsuarioActual = {
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
  const PROFESORA: UsuarioActual = { ...ADMIN, esAdmin: false, profesorId: 9 };

  let fixture: ComponentFixture<AgendarClase>;
  let navegar: ReturnType<typeof vi.spyOn>;
  let listarProfesores: ReturnType<typeof vi.fn>;
  let canchasPublicas: ReturnType<typeof vi.fn>;
  let api: {
    simular: ReturnType<typeof vi.fn>;
    agendar: ReturnType<typeof vi.fn>;
  };

  const montar = async (
    afectadas: HoraAfectada[] = [],
    usuario: UsuarioActual = ADMIN,
    fecha?: string,
  ) => {
    listarProfesores = vi.fn().mockResolvedValue([
      {
        id: 4,
        nombreVisible: 'Ana Silva',
        especialidad: 'Iniciación',
        telefono: '',
        tarifaHoraClp: null,
        activo: true,
        usuarioId: null,
      },
    ]);
    // La lista pública, que el servidor ya da sin las canchas desactivadas (T222).
    canchasPublicas = vi.fn().mockResolvedValue([{ id: 2, nombre: 'Cancha 1' }]);
    api = {
      simular: vi.fn().mockResolvedValue({ afectadas }),
      agendar: vi.fn().mockResolvedValue({ id: 1, bloqueoId: 2, canceladas: [] }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Clases, useValue: api },
        { provide: Profesores, useValue: { listar: listarProfesores } },
        { provide: Disponibilidad, useValue: { canchas: canchasPublicas } },
        { provide: Auth, useValue: { usuario: signal(usuario).asReadonly() } },
      ],
    });

    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(AgendarClase);
    // El día que trae Clases en `?fecha=`: el router se lo da como input.
    if (fecha) fixture.componentRef.setInput('fecha', fecha);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /** Pasa a «Una serie»: el formulario de la clase y el de la serie van uno a la vez. */
  const aLaSerie = async () => {
    await apretar('Una serie');
  };

  beforeEach(async () => {
    await montar();
  });

  it('**llega con el día de Clases, y al agendar vuelve a él con el aviso** (T294)', async () => {
    await montar([], ADMIN, '2026-08-20');

    await apretar('Agendar clase');

    expect(api.agendar).toHaveBeenCalledWith(expect.objectContaining({ fecha: '2026-08-20' }));
    expect(avisoDeLoHecho()).toContain('Clase agendada');
    expect(navegar).toHaveBeenCalledWith(['/administracion/clases'], {
      queryParams: { fecha: '2026-08-20' },
    });
  });

  it('el enlace de vuelta lleva a Clases en el mismo día', async () => {
    await montar([], ADMIN, '2026-08-20');

    expect(
      elemento().querySelector('a[href="/administracion/clases?fecha=2026-08-20"]'),
    ).not.toBeNull();
  });

  it('si los profesores no cargan, lo dice junto a su campo', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Clases, useValue: api },
        { provide: Profesores, useValue: { listar: () => Promise.reject(new Error('caída')) } },
        { provide: Disponibilidad, useValue: { canchas: canchasPublicas } },
        { provide: Auth, useValue: { usuario: signal(ADMIN).asReadonly() } },
      ],
    });
    fixture = TestBed.createComponent(AgendarClase);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('No se pudieron cargar los profesores');
  });

  it('**«Una clase» o «Una serie»: un formulario a la vez**', async () => {
    expect(elemento().querySelector('form')).not.toBeNull();
    expect(elemento().querySelector('app-nueva-serie')).toBeNull();

    await aLaSerie();

    expect(elemento().querySelector('app-nueva-serie')).not.toBeNull();
    expect(texto()).not.toContain('Agendar clase');
  });

  it('sin nadie debajo, agendar no pregunta nada', async () => {
    // Preguntar por preguntar entrena a la gente a apretar sin leer, y entonces la
    // advertencia que sí importa tampoco se lee.
    await apretar('Agendar clase');

    expect(api.agendar).toHaveBeenCalled();
    expect(texto()).not.toContain('hora tomada');
  });

  it('**con una hora tomada debajo, no agenda hasta que el admin la ve**', async () => {
    await montar([TOMADA]);

    await apretar('Agendar clase');

    expect(api.agendar).not.toHaveBeenCalled();
    expect(texto()).toContain('1 hora tomada');
    expect(texto()).toContain('Camila Socia');
  });

  it('recién al confirmar se agenda y se avisa', async () => {
    await montar([TOMADA]);
    api.agendar.mockResolvedValue({ id: 1, bloqueoId: 2, canceladas: [TOMADA] });
    await apretar('Agendar clase');

    await apretar('Agendar igual');

    expect(api.agendar).toHaveBeenCalled();
    // En singular de verdad: "1 persona que tenían esa hora" es lo que sale de
    // pluralizar media frase y dejar el verbo en plural.
    expect(avisoDeLoHecho()).toContain('Avisamos a la persona que tenía esa hora');
  });

  it('"Mejor no" deja todo como estaba', async () => {
    await montar([TOMADA]);
    await apretar('Agendar clase');

    await apretar('Mejor no');

    expect(api.agendar).not.toHaveBeenCalled();
    expect(texto()).not.toContain('hora tomada');
  });

  it('**con un pago en curso no deja confirmar**', async () => {
    // El servidor lo rechaza igual, pero el botón lo dice antes: cancelarla dejaría
    // a esa persona sin cancha y sin su dinero.
    await montar([{ ...TOMADA, pagoEnCurso: true }]);
    await apretar('Agendar clase');

    const boton = Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Agendar igual'),
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(texto()).toContain('pagándose ahora');
  });

  it('si el servidor rechaza, lo dice con sus palabras', async () => {
    api.simular.mockRejectedValue({
      error: { message: 'Esa cancha ya está cerrada en ese rango.' },
    });

    await apretar('Agendar clase');

    expect(texto()).toContain('ya está cerrada');
  });

  it('**las canchas salen de la lista pública, sin las desactivadas**', async () => {
    // Una desactivada no tiene grilla, así que agendar sobre ella responde 404. Desde
    // T222 la lista es la pública, que el servidor ya da solo con las activas: la misma
    // para el admin y el profesor, que no puede leer las del panel.
    const opciones = textosDe(fixture, 'mat-select[name="canchaId"]');

    expect(canchasPublicas).toHaveBeenCalled();
    expect(opciones).toContain('Cancha 1');
  });

  describe('las series', () => {
    it('**ofrece agendar una serie, con las canchas activas y los profesores**', async () => {
      await aLaSerie();
      const serie = fixture.debugElement.query((nodo) => nodo.name === 'app-nueva-serie');

      expect(serie).not.toBeNull();
      expect(serie.componentInstance.canchas()).toEqual([{ id: 2, nombre: 'Cancha 1' }]);
      expect(serie.componentInstance.profesores()).toHaveLength(1);
    });

    it('al agendarla, lo dice y vuelve a Clases en el día', async () => {
      await montar([], ADMIN, '2026-08-20');
      await aLaSerie();
      const serie = fixture.debugElement.query((nodo) => nodo.name === 'app-nueva-serie');

      serie.componentInstance.agendada.emit('Serie agendada: 18 clases.');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(avisoDeLoHecho()).toContain('Serie agendada: 18 clases.');
      expect(navegar).toHaveBeenCalledWith(['/administracion/clases'], {
        queryParams: { fecha: '2026-08-20' },
      });
    });
  });

  describe('el profesor', () => {
    it('no elige profesor ni pide la lista de profesores: la clase queda a su nombre', async () => {
      await montar([], PROFESORA);

      expect(elemento().querySelector('mat-select[name="profesorId"]')).toBeNull();
      expect(listarProfesores).not.toHaveBeenCalled();
      expect(texto()).toContain('Solo en horas libres');

      await apretar('Agendar clase');

      expect(api.agendar).toHaveBeenCalledWith(expect.objectContaining({ profesorId: 9 }));
    });

    it('**sobre una hora reservada ve el aviso, y ningún botón que la cancele**', async () => {
      await montar([TOMADA], PROFESORA);

      await apretar('Agendar clase');

      expect(texto()).toContain(
        'Esta hora tiene reservas. Para agendar encima, habla con administración.',
      );
      expect(texto()).not.toContain('Agendar igual y avisarles');
      expect(api.agendar).not.toHaveBeenCalled();
    });

    it('la serie también queda a su nombre', async () => {
      await montar([], PROFESORA);
      await aLaSerie();

      const serie = fixture.debugElement.query((nodo) => nodo.name === 'app-nueva-serie');
      expect(serie.componentInstance.profesorFijo()).toBe(9);
    });

    it('al admin la serie le deja elegir', async () => {
      await aLaSerie();
      const serie = fixture.debugElement.query((nodo) => nodo.name === 'app-nueva-serie');
      expect(serie.componentInstance.profesorFijo()).toBeNull();
    });
  });

  describe('preparación física', () => {
    /**
     * Marca la opción de un grupo de botones de radio por su etiqueta. En el radio de Material
     * la etiqueta va al lado del input, y un clic en ella lo marca, como en el navegador (T250).
     */
    const elegir = async (etiqueta: string) => {
      Array.from(elemento().querySelectorAll('label'))
        .find((label) => label.textContent?.trim() === etiqueta)!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const profesor = async () => {
      await elegirOpcion(fixture, `mat-select[name="profesorId"]`, '4');
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('**no pide cancha ni nivel, y la clase viaja con su tipo y sin ellos**', async () => {
      await elegir('Preparación física');
      await profesor();

      expect(elemento().querySelector('mat-select[name="canchaId"]')).toBeNull();
      expect(elemento().querySelector('mat-select[name="nivel"]')).toBeNull();

      await apretar('Agendar clase');

      const enviada = api.simular.mock.calls[0][0] as Record<string, unknown>;
      expect(enviada).toMatchObject({ tipo: 'PREPARACION_FISICA', profesorId: 4, cupoMaximo: 6 });
      expect(enviada).not.toHaveProperty('canchaId');
      expect(enviada).not.toHaveProperty('nivel');
      expect(avisoDeLoHecho()).toContain('Clase agendada en el gimnasio');
    });

    it('**"Individual" manda un alumno, y no pregunta el cupo**', async () => {
      await elegir('Preparación física');
      await elegir('Individual');

      expect(elemento().querySelector('input[name="cupoMaximo"]')).toBeNull();

      await apretar('Agendar clase');

      expect(api.simular).toHaveBeenCalledWith(expect.objectContaining({ cupoMaximo: 1 }));
    });

    it('el gimnasio ocupado se dice con las palabras del servidor', async () => {
      api.simular.mockRejectedValue({
        status: 409,
        error: {
          motivo: 'GIMNASIO_OCUPADO',
          message: 'El gimnasio ya tiene una clase de 18:00 a 19:00, con Ana Silva: es una a la vez.',
        },
      });
      await elegir('Preparación física');

      await apretar('Agendar clase');

      expect(texto()).toContain('El gimnasio ya tiene una clase de 18:00 a 19:00');
    });

    it('volviendo a "Tenis" vuelven la cancha y el nivel, y la clase viaja como tenis', async () => {
      await elegir('Preparación física');
      await elegir('Tenis');

      expect(elemento().querySelector('mat-select[name="canchaId"]')).not.toBeNull();

      await apretar('Agendar clase');

      expect(api.simular).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'TENIS', nivel: 'INICIACION' }),
      );
    });
  });
});
