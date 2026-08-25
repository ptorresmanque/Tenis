import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ranking, TablaDelClub } from './ranking.service';
import { TablaInterna } from './tabla-interna';

/**
 * T56. La tabla interna del club, en pantalla.
 *
 * Lo que este archivo cuida: que **los inactivos se vean como inactivos**. Mezclados
 * con el resto, la tabla se lee como si los de abajo jugaran mal en vez de no jugar, y
 * quien lleva ocho meses sin pisar la cancha aparece compitiendo.
 */
describe('TablaInterna', () => {
  const TABLA: TablaDelClub = {
    partidos: 12,
    ultimoPartido: '2026-08-20',
    inactivosDesde: '2026-02-25',
    posiciones: [
      {
        puesto: 1,
        socioId: 1,
        nombre: 'Ana Uno',
        elo: 1246,
        partidos: 5,
        ganados: 4,
        ultimoPartido: '2026-08-20',
        activo: true,
      },
      {
        puesto: 2,
        socioId: 2,
        nombre: 'Beto Dos',
        elo: 1214,
        partidos: 4,
        ganados: 2,
        ultimoPartido: '2026-08-10',
        activo: true,
      },
      {
        puesto: null,
        socioId: 3,
        nombre: 'Cata Tres',
        elo: 1280,
        partidos: 3,
        ganados: 3,
        ultimoPartido: '2025-12-01',
        activo: false,
      },
    ],
  };

  let fixture: ComponentFixture<TablaInterna>;

  const montar = async (tabla: TablaDelClub = TABLA) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Ranking, useValue: { interno: vi.fn().mockResolvedValue(tabla) } }],
    });

    fixture = TestBed.createComponent(TablaInterna);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const filasDe = (seccion: string) =>
    Array.from(elemento().querySelectorAll(`[data-tabla="${seccion}"] tbody tr`)).map((fila) =>
      Array.from(fila.querySelectorAll('th, td')).map((celda) => celda.textContent?.trim() ?? ''),
    );

  beforeEach(async () => {
    await montar();
  });

  it('muestra a cada activo con su puesto, su nombre y su Elo', () => {
    expect(filasDe('activos')[0]).toEqual(['1', 'Ana Uno', '1246', '5', '4']);
  });

  it('**los inactivos van en su propia tabla, no mezclados**', () => {
    // Cata tiene el Elo más alto de todos: si estuviera en la principal, saldría
    // primera sin haber jugado en ocho meses.
    expect(filasDe('activos').map((f) => f[1])).toEqual(['Ana Uno', 'Beto Dos']);
    expect(filasDe('inactivos').map((f) => f[0])).toEqual(['Cata Tres']);
  });

  it('**el inactivo conserva su Elo a la vista**', () => {
    // Salir de la tabla no es perder lo ganado, y hay que poder verlo.
    expect(filasDe('inactivos')[0]).toContain('1280');
  });

  it('dice desde cuándo alguien cuenta como inactivo', () => {
    expect(texto()).toContain('febrero');
    expect(texto()).toContain('2026');
  });

  it('**dice cuál es el último partido que está contando**', () => {
    // El par del corte de 52 semanas en la otra tabla: quien cargó un partido ayer y
    // no lo ve necesita saber si el sistema lo tomó.
    expect(texto()).toContain('20 de agosto de 2026');
  });

  it('**explica que solo cuentan los partidos confirmados**', () => {
    // Es la pregunta que llega al club: "cargué tres y la tabla no se movió".
    expect(texto()).toContain('confirmados');
  });

  it('las dos tablas llevan encabezados', () => {
    const encabezados = Array.from(
      elemento().querySelectorAll('[data-tabla="activos"] thead th[scope="col"]'),
    ).map((th) => th.textContent?.trim());

    expect(encabezados).toEqual(['Puesto', 'Socio', 'Elo', 'Jugados', 'Ganados']);
  });

  it('sin inactivos no dibuja esa sección', async () => {
    await montar({
      ...TABLA,
      posiciones: TABLA.posiciones.filter((f) => f.activo),
    });

    expect(elemento().querySelector('[data-tabla="inactivos"]')).toBeNull();
  });

  it('sin partidos lo dice, en vez de quedar en blanco', async () => {
    await montar({
      partidos: 0,
      ultimoPartido: null,
      inactivosDesde: '2026-02-25',
      posiciones: [],
    });

    expect(texto()).toContain('Todavía no hay partidos');
    expect(elemento().querySelector('[data-tabla="activos"]')).toBeNull();
  });
});
