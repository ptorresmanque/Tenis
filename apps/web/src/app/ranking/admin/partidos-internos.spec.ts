import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PartidoEnDisputa, RankingAdmin } from './partidos-internos.service';
import { PartidosInternosPanel } from './partidos-internos';

/**
 * T55. La salida de emergencia del club.
 *
 * No hay tribunal que decida entre dos versiones de un partido: alguien del club
 * llama por teléfono y lo arregla. Lo que el sistema garantiza es que **se note** que
 * lo resolvió el club y no el rival.
 */
describe('PartidosInternosPanel', () => {
  const RECHAZADO: PartidoEnDisputa = {
    id: 7,
    socioA: 'Ana Uno',
    socioB: 'Beto Dos',
    ganador: 'Ana Uno',
    marcador: '6-4 6-2',
    jugadoEn: '2026-08-20',
    estado: 'RECHAZADO',
    resueltoPorAdmin: false,
  };

  let fixture: ComponentFixture<PartidosInternosPanel>;
  let api: {
    partidosInternos: ReturnType<typeof vi.fn>;
    resolver: ReturnType<typeof vi.fn>;
  };

  const montar = async (partidos: PartidoEnDisputa[] | Error = [RECHAZADO]) => {
    api = {
      partidosInternos: vi.fn(() =>
        partidos instanceof Error ? Promise.reject(partidos) : Promise.resolve(partidos),
      ),
      resolver: vi.fn().mockResolvedValue({ id: 7 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: RankingAdmin, useValue: api }],
    });

    fixture = TestBed.createComponent(PartidosInternosPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const boton = (etiqueta: string) =>
    Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(etiqueta),
    );

  const apretar = async (etiqueta: string) => {
    boton(etiqueta)?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar();
  });

  it('abre en los rechazados, que son los que el club tiene que mirar', () => {
    expect(api.partidosInternos).toHaveBeenCalledWith('RECHAZADO');
  });

  it('muestra a los dos y quién dice que ganó', () => {
    expect(texto()).toContain('Ana Uno');
    expect(texto()).toContain('Beto Dos');
  });

  it('no repite el nombre cuando quien lo cargó dice que ganó él', () => {
    // "Lo cargó Carolina diciendo que ganó Carolina" se lee como un error de la
    // pantalla, no como el dato que es.
    expect(texto()).toContain('que dice haber ganado');
  });

  it('cuando ganó el rival, lo nombra', async () => {
    await montar([{ ...RECHAZADO, ganador: 'Beto Dos' }]);

    expect(texto()).toContain('que dice que ganó Beto Dos');
  });

  it('**dar por bueno lo deja confirmado**', async () => {
    await apretar('Dar por jugado');

    expect(api.resolver).toHaveBeenCalledWith(7, 'CONFIRMADO');
  });

  it('descartarlo lo deja rechazado', async () => {
    await apretar('Descartar');

    expect(api.resolver).toHaveBeenCalledWith(7, 'RECHAZADO');
  });

  it('resolver recarga la lista, no la pinta a mano', async () => {
    await apretar('Dar por jugado');

    expect(api.partidosInternos).toHaveBeenCalledTimes(2);
  });

  it('uno que ya resolvió el club se ve marcado', async () => {
    await montar([{ ...RECHAZADO, resueltoPorAdmin: true, estado: 'CONFIRMADO' }]);

    expect(texto()).toContain('Resuelto por el club');
  });

  it('sin nada en disputa lo dice, que es la buena noticia', async () => {
    await montar([]);

    expect(texto()).toContain('No hay partidos en disputa');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la lista no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudieron cargar los partidos');
  });
});
