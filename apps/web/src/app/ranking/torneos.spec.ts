import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Auth, UsuarioActual } from '../core/auth/auth';
import { Ranking, TablaDeTorneos } from './ranking.service';
import { RankingDeTorneos } from './torneos';

/**
 * T54. El ranking de torneos, visto desde la calle.
 *
 * Lo que este archivo cuida por encima de todo: que **la pantalla diga qué está
 * contando**. La tabla cambia sin que pase nada —un lunes cualquiera alguien baja tres
 * puestos porque caducó el torneo del año pasado—, y una tabla que no explica su corte
 * es una llamada al club.
 */
describe('RankingDeTorneos', () => {
  const TABLA: TablaDeTorneos = {
    desde: '2025-08-26',
    torneos: [
      {
        id: 5,
        nombre: 'Copa de verano',
        categoria: 'Club 250',
        fechaFin: '2026-01-15',
      },
    ],
    posiciones: [
      { puesto: 1, jugadorId: 1, nombre: 'Ana Uno', puntos: 400, torneos: 2 },
      { puesto: 1, jugadorId: 2, nombre: 'Beto Dos', puntos: 400, torneos: 2 },
      { puesto: 3, jugadorId: 3, nombre: 'Cata Tres', puntos: 150, torneos: 1 },
    ],
  };

  /** Un socio cualquiera; `null` es quien mira desde la calle. */
  const SOCIA: UsuarioActual = {
    id: 9,
    nombre: 'Ana Uno',
    apellido: '',
    telefono: null,
    email: 'ana@ejemplo.cl',
    esAdmin: false,
    socioId: 3,
    socioActivo: true,
    socioAlDia: true,
    profesorId: null,
  };

  let fixture: ComponentFixture<RankingDeTorneos>;

  const montar = async (tabla: TablaDeTorneos = TABLA, quien: UsuarioActual | null = null) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Ranking,
          useValue: {
            torneos: vi.fn().mockResolvedValue(tabla),
            interno: vi.fn().mockResolvedValue({
              partidos: 0,
              ultimoPartido: null,
              inactivosDesde: '2026-02-25',
              posiciones: [],
            }),
          },
        },
        { provide: Auth, useValue: { usuario: signal(quien).asReadonly() } },
      ],
    });

    fixture = TestBed.createComponent(RankingDeTorneos);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  /** Las filas de la tabla, cada una como el texto de sus celdas. */
  const filas = () =>
    Array.from(elemento().querySelectorAll('[data-tabla="torneos"] tbody tr')).map((fila) =>
      Array.from(fila.querySelectorAll('th, td')).map((celda) => celda.textContent?.trim() ?? ''),
    );

  beforeEach(async () => {
    await montar();
  });

  it('muestra a cada uno con su puesto, su nombre y sus puntos', () => {
    expect(filas()[0]).toEqual(['1', 'Ana Uno', '400', '2']);
  });

  it('**el empate se muestra como empate: dos en el 1 y el siguiente en el 3**', () => {
    // Romper el empate con un criterio que nadie ve deja al de abajo explicando por
    // qué está abajo. El orden de las filas lo deciden los desempates; el puesto, no.
    expect(filas().map((fila) => fila[0])).toEqual(['1', '1', '3']);
  });

  it('**dice desde cuándo está contando, con el año**', () => {
    // Sin el año, "desde el 26 de agosto" no dice nada: el corte está siempre a un
    // año de distancia y la pregunta es justamente de qué año.
    expect(texto()).toContain('agosto');
    expect(texto()).toContain('2025');
  });

  it('**dice qué torneos está contando**', () => {
    expect(texto()).toContain('Copa de verano');
  });

  it('va en una tabla de verdad, con encabezados', () => {
    // Acá sí es una tabla —filas y columnas comparables—, al revés que el cuadro,
    // que son llaves. Sin encabezados, un lector de pantalla lee cuatro números
    // sueltos por fila.
    const encabezados = Array.from(
      elemento().querySelectorAll('[data-tabla="torneos"] thead th[scope="col"]'),
    ).map((th) => th.textContent?.trim());

    expect(encabezados).toEqual(['Puesto', 'Jugador', 'Puntos', 'Torneos']);
  });

  it('sin nadie en la tabla lo dice, en vez de quedar en blanco', async () => {
    await montar({ ...TABLA, torneos: [], posiciones: [] });

    expect(texto()).toContain('Todavía no hay puntos');
    expect(elemento().querySelector('[data-tabla="torneos"]')).toBeNull();
  });

  it('**la tabla del club no se le muestra a quien mira desde la calle**', () => {
    // El endpoint se la niega igual; una sección que carga un 403 es peor que una
    // que no está.
    expect(texto()).not.toContain('Tabla del club');
  });

  it('**y sí a un socio**', async () => {
    await montar(TABLA, SOCIA);

    expect(texto()).toContain('Tabla del club');
  });

  it('con la tabla vacía sigue diciendo desde cuándo cuenta', async () => {
    // Es cuando más falta hace: quien ganó un torneo hace catorce meses y no se ve
    // en la tabla necesita leer por qué.
    await montar({ ...TABLA, torneos: [], posiciones: [] });

    expect(texto()).toContain('agosto');
  });
});
