import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdminCanchas,
  HoraAfectada,
} from '../../catalogo-canchas/admin/admin-canchas.service';
import { ClaseDelDia, Clases } from '../clases.service';
import { Profesores } from '../profesores.service';
import { AgendaDeClases } from './agenda-clases';

/**
 * T46. Agendar una clase es cerrar la cancha, y esta pantalla lo trata como tal.
 *
 * Lo que este archivo cuida: que **con horas tomadas debajo no se agende de una**.
 * El admin ve a quién le va a quitar la hora y recién ahí decide. Sin ese paso,
 * cancelar reservas automáticamente es un descuido esperando ocurrir.
 */
describe('AgendaDeClases', () => {
  const CLASE: ClaseDelDia = {
    id: 7,
    cancha: 'Cancha 1',
    profesor: 'Ana Silva',
    inicio: '2026-08-17T21:00:00.000Z',
    fin: '2026-08-17T22:00:00.000Z',
    nivel: 'INICIACION',
    estado: 'PROGRAMADA',
    cupoMaximo: 6,
    notas: null,
  };

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

  let fixture: ComponentFixture<AgendaDeClases>;
  let api: {
    delDia: ReturnType<typeof vi.fn>;
    simular: ReturnType<typeof vi.fn>;
    agendar: ReturnType<typeof vi.fn>;
    cancelar: ReturnType<typeof vi.fn>;
  };

  const montar = async (clases: ClaseDelDia[], afectadas: HoraAfectada[] = []) => {
    api = {
      delDia: vi.fn().mockResolvedValue(clases),
      simular: vi.fn().mockResolvedValue({ afectadas }),
      agendar: vi.fn().mockResolvedValue({ id: 1, bloqueoId: 2, canceladas: [] }),
      cancelar: vi.fn().mockResolvedValue({ id: 7 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Clases, useValue: api },
        {
          provide: Profesores,
          useValue: {
            listar: vi.fn().mockResolvedValue([
              {
                id: 4,
                nombreVisible: 'Ana Silva',
                especialidad: 'Iniciación',
                telefono: '',
                tarifaHoraClp: null,
                activo: true,
              },
            ]),
          },
        },
        {
          provide: AdminCanchas,
          useValue: {
            canchas: vi.fn().mockResolvedValue([
              { id: 2, nombre: 'Cancha 1', activa: true },
              { id: 5, nombre: 'Cancha en obras', activa: false },
            ]),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(AgendaDeClases);
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

  beforeEach(async () => {
    await montar([CLASE]);
  });

  it('lista las clases del día con su profesor y su nivel', () => {
    expect(texto()).toContain('Ana Silva');
    expect(texto()).toContain('Iniciación');
    expect(texto()).toContain('Cancha 1');
  });

  it('sin nadie debajo, agendar no pregunta nada', async () => {
    // Preguntar por preguntar entrena a la gente a apretar sin leer, y entonces la
    // advertencia que sí importa tampoco se lee.
    await apretar('Agendar clase');

    expect(api.agendar).toHaveBeenCalled();
    expect(texto()).not.toContain('hora tomada');
  });

  it('**con una hora tomada debajo, no agenda hasta que el admin la ve**', async () => {
    await montar([CLASE], [TOMADA]);

    await apretar('Agendar clase');

    expect(api.agendar).not.toHaveBeenCalled();
    expect(texto()).toContain('1 hora tomada');
    expect(texto()).toContain('Camila Socia');
  });

  it('recién al confirmar se agenda y se avisa', async () => {
    await montar([CLASE], [TOMADA]);
    api.agendar.mockResolvedValue({ id: 1, bloqueoId: 2, canceladas: [TOMADA] });
    await apretar('Agendar clase');

    await apretar('Agendar igual');

    expect(api.agendar).toHaveBeenCalled();
    // En singular de verdad: "1 persona que tenían esa hora" es lo que sale de
    // pluralizar media frase y dejar el verbo en plural.
    expect(texto()).toContain('Avisamos a la persona que tenía esa hora');
  });

  it('"Mejor no" deja todo como estaba', async () => {
    await montar([CLASE], [TOMADA]);
    await apretar('Agendar clase');

    await apretar('Mejor no');

    expect(api.agendar).not.toHaveBeenCalled();
    expect(texto()).not.toContain('hora tomada');
  });

  it('**con un pago en curso no deja confirmar**', async () => {
    // El servidor lo rechaza igual, pero el botón lo dice antes: cancelarla dejaría
    // a esa persona sin cancha y sin su dinero.
    await montar([CLASE], [{ ...TOMADA, pagoEnCurso: true }]);
    await apretar('Agendar clase');

    const boton = Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Agendar igual'),
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(texto()).toContain('pagándose ahora');
  });

  it('cancelar una clase exige un motivo, y sin él no llama al servidor', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('  ');

    await apretar('Cancelar clase');

    expect(api.cancelar).not.toHaveBeenCalled();
  });

  it('con motivo, la cancela y lo dice', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Se enfermó');

    await apretar('Cancelar clase');

    expect(api.cancelar).toHaveBeenCalledWith(7, 'Se enfermó');
    expect(texto()).toContain('vuelve a estar disponible');
  });

  it('si el servidor rechaza, lo dice con sus palabras', async () => {
    api.simular.mockRejectedValue({
      error: { message: 'Esa cancha ya está cerrada en ese rango.' },
    });

    await apretar('Agendar clase');

    expect(texto()).toContain('ya está cerrada');
  });

  it('**una cancha desactivada no se ofrece: el servidor la rechaza siempre**', async () => {
    // No tiene grilla, así que agendar sobre ella responde 404. Ofrecerla en el
    // selector es ofrecer un callejón.
    const opciones = Array.from(
      elemento().querySelectorAll('select[name="canchaId"] option'),
    ).map((o) => o.textContent?.trim());

    expect(opciones).toContain('Cancha 1');
    expect(opciones).not.toContain('Cancha en obras');
  });

  it('**a una clase que ya se dio no se le ofrece cancelarla**', async () => {
    // El servidor lo rechaza con un 409; ofrecerlo solo sirve para descubrirlo
    // apretando. Es el mismo criterio de las canchas desactivadas.
    await montar([{ ...CLASE, estado: 'REALIZADA' }]);

    expect(texto()).toContain('Ya se dio');
    expect(
      Array.from(elemento().querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Cancelar clase'),
      ),
    ).toBe(false);
  });

  it('sin clases el día lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(texto()).toContain('No hay clases este día');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la API no responde, lo dice en vez de reventar', async () => {
    const caida = () => Promise.reject(new Error('la API no respondió'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Clases, useValue: { delDia: caida } },
        { provide: Profesores, useValue: { listar: caida } },
        { provide: AdminCanchas, useValue: { canchas: caida } },
      ],
    });

    fixture = TestBed.createComponent(AgendaDeClases);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('No se pudieron cargar las clases');
    expect(texto()).toContain('No se pudieron cargar los profesores');
  });
});
