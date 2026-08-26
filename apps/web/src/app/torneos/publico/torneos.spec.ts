import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CuadroPublico,
  PartidoPublico,
  Torneos,
  TorneoPublico,
} from '../torneos.service';
import { TorneosPublicos } from './torneos';

/**
 * T53. Los torneos que se ven desde la calle.
 *
 * Lo que este archivo cuida: que **el cuadro se pueda mirar en un teléfono**. Va en
 * columnas que se desplazan de lado y no en una tabla que se encoge; en 375px una tabla
 * de cuatro rondas queda ilegible, y este cuadro se mira sobre todo desde el club.
 */
describe('TorneosPublicos', () => {
  const EN_INSCRIPCION: TorneoPublico = {
    id: 5,
    nombre: 'Copa de verano',
    categoria: 'Club 250',
    superficie: 'ARCILLA',
    fechaInicio: '2026-12-01',
    fechaFin: '2026-12-07',
    cierreInscripcion: '2026-11-25',
    estado: 'INSCRIPCION',
    cupo: 8,
    cuposLibres: 3,
  };

  const SEMIFINAL: PartidoPublico = {
    ronda: 1,
    ronda_nombre: 'Semifinal',
    posicion: 1,
    jugadorA: 'Ana Uno',
    jugadorB: 'Beto Dos',
    ganador: 'Ana Uno',
    marcador: '6-4 6-2',
    walkover: false,
  };

  const CUADRO: CuadroPublico = {
    id: 5,
    nombre: 'Copa de verano',
    categoria: 'Club 250',
    estado: 'CUADRO_ARMADO',
    inscritos: ['Ana Uno', 'Beto Dos'],
    partidos: [
      SEMIFINAL,
      { ...SEMIFINAL, posicion: 2, ganador: null, marcador: null },
      {
        ...SEMIFINAL,
        ronda: 2,
        ronda_nombre: 'Final',
        posicion: 1,
        jugadorA: null,
        jugadorB: null,
        ganador: null,
        marcador: null,
      },
    ],
  };

  let fixture: ComponentFixture<TorneosPublicos>;
  let api: {
    calendario: ReturnType<typeof vi.fn>;
    cuadroPublico: ReturnType<typeof vi.fn>;
  };

  const montar = async (torneos: TorneoPublico[], cuadro = CUADRO) => {
    api = {
      calendario: vi.fn().mockResolvedValue(torneos),
      cuadroPublico: vi.fn().mockResolvedValue(cuadro),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(TorneosPublicos);
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
    await montar([EN_INSCRIPCION]);
  });

  it('muestra el torneo con su categoría y sus fechas en palabras', () => {
    expect(texto()).toContain('Copa de verano');
    expect(texto()).toContain('Club 250');
    expect(texto()).toContain('diciembre');
  });

  it('**dice cuántos cupos quedan mientras la inscripción está abierta**', () => {
    expect(texto()).toContain('3');
    expect(texto()).toContain('cupos');
  });

  it('sin cupos lo dice, y explica que se entra en lista de espera', async () => {
    await montar([{ ...EN_INSCRIPCION, cuposLibres: 0 }]);

    expect(texto()).toContain('lista de espera');
  });

  it('un torneo que ya empezó no habla de inscripción', async () => {
    await montar([{ ...EN_INSCRIPCION, estado: 'EN_CURSO' }]);

    // Dentro de la tarjeta y no en toda la página: el párrafo de arriba también
    // nombra los cupos, y buscarlo suelto haría pasar el test por otra razón.
    const tarjeta = elemento().querySelector('li')?.textContent ?? '';
    expect(tarjeta).not.toContain('cupos');
    expect(tarjeta).toContain('En curso');
  });

  it('**el cuadro va en columnas que se desplazan, no en una tabla que se encoge**', async () => {
    // En 375px una tabla de cuatro rondas queda ilegible, y este cuadro se mira sobre
    // todo desde el teléfono, en el club.
    await apretar('Ver quiénes juegan');

    expect(elemento().querySelector('table')).toBeNull();
    expect(elemento().querySelector('.overflow-x-auto')).not.toBeNull();
  });

  it('el cuadro muestra el marcador y quién ganó', async () => {
    await apretar('Ver quiénes juegan');

    expect(texto()).toContain('6-4 6-2');
    const enNegrita = elemento().querySelector('li li .font-semibold');
    expect(enNegrita?.textContent).toContain('Ana Uno');
  });

  it('antes de armarse muestra los inscritos, que es lo que se quiere saber', async () => {
    await montar([EN_INSCRIPCION], {
      ...CUADRO,
      estado: 'INSCRIPCION',
      partidos: [],
    });

    await apretar('Ver quiénes juegan');

    expect(texto()).toContain('Ana Uno, Beto Dos');
  });

  it('**no publica el teléfono de nadie: no viene en la respuesta**', async () => {
    await apretar('Ver quiénes juegan');

    expect(texto()).not.toMatch(/\+?56\d{8}/);
  });

  it('**el cuadro de un torneo no se muestra bajo el nombre de otro**', async () => {
    // Al cambiar de torneo, el `resource` conserva el valor anterior hasta que llega
    // el nuevo: sin comprobar de quién es el cuadro que se tiene en la mano, la
    // tarjeta del segundo dibuja el del primero mientras carga. Acá el servidor
    // devuelve siempre el cuadro del torneo 5, y el que se abre es el 9.
    const otro = { ...EN_INSCRIPCION, id: 9, nombre: 'Copa de invierno' };
    await montar([otro]);

    await apretar('Ver quiénes juegan');

    expect(texto()).not.toContain('6-4 6-2');
  });

  it('sin torneos este año lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(texto()).toContain('Todavía no hay torneos este año');
  });
});
