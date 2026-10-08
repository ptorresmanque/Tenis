import { BadRequestException } from '@nestjs/common';

import { ZONA_DEL_CLUB } from '../comun/tiempo';
import { leerSerie } from './clases.dto';
import { clasesDeLaSerie, fechasDeLaSerie } from './series';

/**
 * T113. Una serie de clases ("martes y jueves de 19 a 20, hasta el 15 de diciembre") es una
 * lista de clases sueltas, una por fecha. Cada una se lee como una clase suelta, así que la
 * hora del club y el cambio de horario se resuelven en el mismo lugar que siempre.
 */
describe('series de clases', () => {
  const MARTES = 2;
  const JUEVES = 4;
  const LUNES = 1;

  const SERIE = {
    canchaId: 3,
    profesorId: 5,
    diasSemana: [MARTES, JUEVES],
    horaDesde: '19:00',
    horaHasta: '20:00',
    desde: '2026-10-14',
    hasta: '2026-12-15',
    cupoMaximo: 6,
    nivel: 'INICIACION',
  };

  const HORA = new Intl.DateTimeFormat('es-CL', {
    timeZone: ZONA_DEL_CLUB,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  describe('fechasDeLaSerie', () => {
    it('**martes y jueves del 14 de octubre al 15 de diciembre son 18 fechas**', () => {
      const fechas = fechasDeLaSerie(leerSerie(SERIE));

      expect(fechas).toHaveLength(18);
      // El 14 es miércoles: la primera es el jueves 15. El 15 de diciembre, martes, entra.
      expect(fechas[0]).toBe('2026-10-15');
      expect(fechas.at(-1)).toBe('2026-12-15');
    });

    it('el día de la semana es el del calendario, no el de un instante en UTC', () => {
      // Un sábado a las 22:00 del club ya es domingo en UTC: contar con instantes correría
      // la serie un día.
      const fechas = fechasDeLaSerie(
        leerSerie({
          ...SERIE,
          diasSemana: [6],
          desde: '2026-10-17',
          hasta: '2026-10-31',
        }),
      );

      expect(fechas).toEqual(['2026-10-17', '2026-10-24', '2026-10-31']);
    });
  });

  describe('clasesDeLaSerie', () => {
    it('**de marzo a mayo, todas a las 19:00 del club, antes y después del cambio de horario de abril**', () => {
      // Chile vuelve al horario de invierno el primer fin de semana de abril: en 2027, la
      // noche del 3 al 4. Una serie que sumara 24 horas a un instante fijo quedaría a las 18:00.
      const clases = clasesDeLaSerie(
        leerSerie({
          ...SERIE,
          diasSemana: [LUNES],
          desde: '2027-03-01',
          hasta: '2027-05-31',
        }),
      );

      expect(clases).toHaveLength(14);
      expect(new Set(clases.map((clase) => HORA.format(clase.inicio)))).toEqual(
        new Set(['19:00']),
      );
      // Y en UTC sí cambian: 22:00 en marzo (UTC-3) y 23:00 en mayo (UTC-4).
      expect(clases[0].inicio.toISOString()).toBe('2027-03-01T22:00:00.000Z');
      expect(clases.at(-1)!.inicio.toISOString()).toBe(
        '2027-05-31T23:00:00.000Z',
      );
    });

    it('cada clase trae la ficha de la serie', () => {
      const [primera] = clasesDeLaSerie(leerSerie(SERIE));

      expect(primera).toMatchObject({
        canchaId: 3,
        profesorId: 5,
        fecha: '2026-10-15',
        cupoMaximo: 6,
        nivel: 'INICIACION',
        notas: null,
      });
    });
  });

  describe('leerSerie', () => {
    const rechaza = (parche: Record<string, unknown>, mensaje: RegExp) =>
      expect(() => leerSerie({ ...SERIE, ...parche })).toThrow(mensaje);

    it('**más de 6 meses responde 400** (A10)', () => {
      rechaza({ hasta: '2027-04-15' }, /6 meses/);
    });

    it('justo 6 meses todavía entra', () => {
      expect(() => leerSerie({ ...SERIE, hasta: '2027-04-14' })).not.toThrow();
    });

    it('**ningún día de la semana responde 400**', () => {
      rechaza({ diasSemana: [] }, /al menos un día/);
    });

    it('un día que no existe responde 400', () => {
      rechaza({ diasSemana: [7] }, /0 \(domingo\) a 6 \(sábado\)/);
    });

    it('una serie que termina antes de empezar responde 400', () => {
      rechaza(
        { desde: '2026-12-15', hasta: '2026-10-14' },
        /terminar después de empezar/,
      );
    });

    it('una fecha que no existe responde 400', () => {
      rechaza({ hasta: '2026-02-30' }, /AAAA-MM-DD/);
    });

    it('lo de cada clase se valida como en una clase suelta', () => {
      expect(() => leerSerie({ ...SERIE, horaHasta: '18:00' })).toThrow(
        BadRequestException,
      );
      rechaza({ nivel: 'EXPERTO' }, /nivel/);
    });

    it('los días repetidos cuentan una vez', () => {
      expect(
        leerSerie({ ...SERIE, diasSemana: [JUEVES, MARTES, JUEVES] })
          .diasSemana,
      ).toEqual([MARTES, JUEVES]);
    });
  });
});
