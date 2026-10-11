import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClasePublica, Clases, ProfesorPublico, SeriePublica } from '../clases.service';
import { ClasesPublicas } from './clases';

/**
 * T48. Lo que ve de las clases quien todavía no es del club.
 *
 * Es el circuito del apoderado: mira los horarios y pregunta desde ahí mismo. Lo que
 * este archivo cuida es que **la consulta salga marcada como de clases** —quien llegó
 * a esta página ya dijo qué busca, y hacerlo elegir de nuevo en una lista donde
 * "quiero asociarme" está primero manda la pregunta al buzón equivocado.
 */
describe('ClasesPublicas', () => {
  const ANA: ProfesorPublico = {
    nombreVisible: 'Ana Silva',
    especialidad: 'Niños',
  };

  const CLASE: ClasePublica = {
    id: 3,
    cancha: 'Cancha 1',
    profesor: 'Ana Silva',
    // 21:00Z de un lunes de agosto son las 17:00 en Santiago.
    inicio: '2026-08-17T21:00:00.000Z',
    fin: '2026-08-17T22:00:00.000Z',
    nivel: 'NINOS',
    cuposLibres: 3,
  };

  let fixture: ComponentFixture<ClasesPublicas>;

  const montar = async (
    profesores: ProfesorPublico[],
    clases: ClasePublica[],
    series: SeriePublica[] = [],
  ) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Clases,
          useValue: {
            publicas: vi.fn().mockResolvedValue({ profesores, clases, series }),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ClasesPublicas);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  beforeEach(async () => {
    await montar([ANA], [CLASE]);
  });

  it('anuncia a los profesores con su especialidad', () => {
    expect(texto()).toContain('Ana Silva');
    expect(texto()).toContain('Niños');
  });

  it('muestra el horario en hora del club y el día en palabras', () => {
    expect(texto()).toContain('17:00–18:00');
    expect(texto()).toContain('lunes');
  });

  it('**dice cuántos cupos quedan, que es lo que el apoderado pregunta**', () => {
    expect(texto()).toContain('3 cupos');
  });

  it('la clase llena lo dice, en vez de ofrecer un cupo que no hay', async () => {
    await montar([ANA], [{ ...CLASE, cuposLibres: 0 }]);

    expect(texto()).toContain('Sin cupos');
  });

  it('**la consulta sale marcada como de clases**', () => {
    const select = elemento().querySelector(
      'select[name="tipo"]',
    ) as HTMLSelectElement;

    expect(select.value).toBe('CLASES');
  });

  it('**no se puede inscribir desde el sitio: el club es quien inscribe**', () => {
    expect(
      Array.from(elemento().querySelectorAll('button')).some((b) =>
        /Inscribir|Anotarme|Reservar/.test(b.textContent ?? ''),
      ),
    ).toBe(false);
  });

  it('una semana sin clases no queda en blanco: invita a preguntar igual', async () => {
    await montar([ANA], []);

    expect(texto()).toContain('No hay clases programadas esta semana');
    // Y el formulario sigue ahí: es justo cuando más sirve preguntar.
    expect(elemento().querySelector('select[name="tipo"]')).not.toBeNull();
  });

  it('sin profesores cargados todavía, la página no se rompe', async () => {
    await montar([], []);

    expect(texto()).toContain('Estamos armando el equipo');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si los horarios no cargan, lo dice', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Clases,
          useValue: { publicas: () => Promise.reject(new Error('la API no respondió')) },
        },
      ],
    });

    fixture = TestBed.createComponent(ClasesPublicas);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('No se pudieron cargar las clases');
  });

  /** T117. Una serie es una tarjeta, no una clase por fecha. */
  describe('las series', () => {
    const SERIE: SeriePublica = {
      id: 9,
      profesor: 'Ana Silva',
      cancha: 'Cancha 2',
      nivel: 'INICIACION',
      diasSemana: [2, 4],
      horaDesde: '19:00',
      horaHasta: '20:00',
      hasta: '2026-12-15',
      cuposLibres: 4,
    };

    it('**la serie es una sola tarjeta: los días, el horario y hasta cuándo**', async () => {
      await montar([ANA], [CLASE], [SERIE]);

      expect(texto()).toContain('Martes y jueves, 19:00–20:00');
      expect(texto()).toContain('hasta el 15 de diciembre');
      expect(texto()).toContain('Ana Silva · Cancha 2');
      expect(texto()).toContain('4 cupos');
    });

    it('con tres días los nombra en orden, desde el lunes', async () => {
      await montar([ANA], [], [{ ...SERIE, diasSemana: [5, 1, 3] }]);

      expect(texto()).toContain('Lunes, miércoles y viernes');
    });

    it('una semana sin clases sueltas pero con series no dice que no hay clases', async () => {
      await montar([ANA], [], [SERIE]);

      expect(texto()).not.toContain('No hay clases programadas esta semana');
      expect(texto()).toContain('Martes y jueves');
    });

    it('la serie llena lo dice', async () => {
      await montar([ANA], [], [{ ...SERIE, cuposLibres: 0 }]);

      expect(texto()).toContain('Sin cupos');
    });
  });
});

