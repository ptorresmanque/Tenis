import { BadRequestException } from '@nestjs/common';

import { leerTabla } from './tabla';

/**
 * T189. La tabla de puntos de un nivel: siete filas, de campeón a treintaidosavos.
 *
 * **La escala no se puede desordenar** (`SPEC-tours.md` § La tabla de puntos): cada fila
 * vale lo mismo o menos que la anterior, el campeón da más de cero y ninguna fila es
 * negativa. El mensaje nombra la fila que sobra, que es la que el admin tiene que mirar.
 */
describe('leerTabla', () => {
  const NIVEL_250 = {
    campeon: 250,
    finalista: 150,
    semifinal: 90,
    cuartos: 45,
    octavos: 20,
    dieciseisavos: 10,
    treintaidosavos: 5,
  };

  const mensaje = (tabla: unknown): string => {
    try {
      leerTabla(tabla);
    } catch (falla) {
      expect(falla).toBeInstanceOf(BadRequestException);
      return (falla as BadRequestException).message;
    }
    throw new Error('La tabla pasó y no tenía que pasar.');
  };

  it('una tabla que baja fila a fila pasa tal cual', () => {
    expect(leerTabla(NIVEL_250)).toEqual(NIVEL_250);
  });

  it('**filas iguales sí**: dos rondas pueden valer lo mismo, y las últimas, cero', () => {
    const plana = {
      ...NIVEL_250,
      octavos: 10,
      dieciseisavos: 0,
      treintaidosavos: 0,
    };

    expect(leerTabla(plana)).toEqual(plana);
  });

  it('**la primera ronda puede dar puntos** (D7): ninguna fila está obligada a ser cero', () => {
    const conTodo = { ...NIVEL_250, treintaidosavos: 5 };

    expect(leerTabla(conTodo).treintaidosavos).toBe(5);
  });

  it('**una semifinal que da más que la final se rechaza**, y el mensaje la nombra', () => {
    expect(mensaje({ ...NIVEL_250, semifinal: 200 })).toBe(
      'La semifinal no puede dar más puntos que la final (200 contra 150).',
    );
  });

  it('el campeón en cero se rechaza: un nivel que no da puntos no ordena nada', () => {
    expect(
      mensaje({
        ...NIVEL_250,
        campeon: 0,
        finalista: 0,
        semifinal: 0,
        cuartos: 0,
        octavos: 0,
        dieciseisavos: 0,
        treintaidosavos: 0,
      }),
    ).toBe('El campeón tiene que dar más de cero puntos.');
  });

  it('una fila negativa se rechaza, nombrándola', () => {
    expect(mensaje({ ...NIVEL_250, treintaidosavos: -5 })).toBe(
      'Los treintaidosavos no pueden dar puntos negativos.',
    );
  });

  it('una fila que falta, con coma o en texto se rechaza, nombrándola', () => {
    const { octavos, ...sinOctavos } = NIVEL_250;
    void octavos;

    expect(mensaje(sinOctavos)).toBe(
      'Faltan los puntos de octavos, en número entero.',
    );
    expect(mensaje({ ...NIVEL_250, cuartos: 45.5 })).toBe(
      'Faltan los puntos de cuartos, en número entero.',
    );
    expect(mensaje({ ...NIVEL_250, cuartos: '45' })).toBe(
      'Faltan los puntos de cuartos, en número entero.',
    );
  });

  it('un dedazo de un cero de más se rechaza: el tope es 100.000 por fila', () => {
    expect(mensaje({ ...NIVEL_250, campeon: 250_000 })).toBe(
      'El campeón no puede dar más de 100.000 puntos.',
    );
  });

  it('sin tabla, se rechaza', () => {
    expect(mensaje(undefined)).toBe('Falta la tabla de puntos.');
  });
});
