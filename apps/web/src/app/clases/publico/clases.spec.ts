import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClasePublica, Clases, ProfesorPublico } from '../clases.service';
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
  ) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Clases,
          useValue: {
            publicas: vi.fn().mockResolvedValue({ profesores, clases }),
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
});
