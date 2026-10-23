import { inscritosALaVista } from './torneos-publicos.service';

/**
 * T376, `SPEC.md` § Inscritos a la vista desde el 80 %: la tabla de la spec, fila por fila. Las
 * pruebas de integración miran los bordes con la base; esta fija el umbral por arriba y por
 * abajo, para que un 75 % o un redondeo no pasen callados.
 */
describe('Cuándo se publican los inscritos de una categoría', () => {
  const cuadro = (
    ocupados: number,
    cupo: number,
    semillaSorteo: number | null = null,
  ) => ({
    cupo,
    semillaSorteo,
    _count: { inscripciones: ocupados },
  });

  // [cupo, desde cuántos inscritos se ve]
  it.each([
    [2, 2],
    [4, 4],
    [8, 7],
    [12, 10],
    [16, 13],
    [20, 16],
    [32, 16],
    [256, 16],
  ])('con cupo %i se ve desde %i inscritos, y uno menos no', (cupo, desde) => {
    expect(inscritosALaVista(cuadro(desde, cupo))).toBe(true);
    expect(inscritosALaVista(cuadro(desde - 1, cupo))).toBe(false);
  });

  it('**con el cuadro armado se ve siempre**, aunque haya pocos', () => {
    expect(inscritosALaVista(cuadro(2, 32, 12345))).toBe(true);
  });
});
