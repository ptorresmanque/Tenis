import { semanaDesde } from './clases-publicas.service';

/**
 * La semana que se anuncia, alrededor de los dos domingos que no tienen 24 horas.
 *
 * Va como test propio y no dentro del spec de la API porque el error solo aparece dos
 * veces al año: un test que dependa de qué día se corre no prueba nada el resto del
 * tiempo, y este pasa o falla siempre por la misma razón.
 */
describe('semanaDesde', () => {
  const horas = (fecha: string) => {
    const { desde, hasta } = semanaDesde(fecha);

    return (hasta.getTime() - desde.getTime()) / (60 * 60 * 1000);
  };

  it('una semana normal dura siete días de veinticuatro horas', () => {
    expect(horas('2026-08-03')).toBe(168);
  });

  it('**la semana en que Chile adelanta la hora dura una hora menos**', () => {
    // El primer domingo de septiembre el reloj salta de las 24:00 a la 1:00. Con la
    // aritmética de milisegundos, la clase del último día a las 21:00 se caía de la
    // lista y nadie entendía por qué.
    expect(horas('2026-09-02')).toBe(167);
  });

  it('**la semana en que Chile atrasa la hora dura una hora más**', () => {
    // Primer domingo de abril, el domingo de 25 horas.
    expect(horas('2026-03-31')).toBe(169);
  });

  it('empieza a medianoche del club, no a medianoche UTC', () => {
    const { desde } = semanaDesde('2026-08-03');

    // Agosto es invierno en Chile: UTC-4, así que las 00:00 del club son las 04:00Z.
    expect(desde.toISOString()).toBe('2026-08-03T04:00:00.000Z');
  });
});
