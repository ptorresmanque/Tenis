import {
  recordatorioPrevio,
  recordatorioVencido,
  recordatoriosDeHoy,
} from './recordatorios';

/**
 * T111. Qué recordatorio de cuota toca cada día, y lo que dice. Que salga una sola vez y
 * en tandas se prueba contra la base, en `cuotas-recordatorios.spec.ts`.
 */
describe('recordatorios de cuota', () => {
  const dia = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);

  describe('recordatoriosDeHoy', () => {
    it('**el 26 de un mes de 31 días toca el previo del mes siguiente**, además del vencido', () => {
      expect(recordatoriosDeHoy(dia('2037-10-26'))).toEqual([
        { tipo: 'VENCIDA', periodo: '2037-10' },
        { tipo: 'PREVIO', periodo: '2037-11' },
      ]);
    });

    it('el 25 todavía no: faltan más de 5 días para fin de mes', () => {
      expect(recordatoriosDeHoy(dia('2037-10-25'))).toEqual([
        { tipo: 'VENCIDA', periodo: '2037-10' },
      ]);
    });

    it('**el día 1 toca el vencido del mes que empieza**', () => {
      expect(recordatoriosDeHoy(dia('2037-11-01'))).toEqual([
        { tipo: 'VENCIDA', periodo: '2037-11' },
      ]);
    });

    it('**en un febrero de 28 días el previo empieza el 23**', () => {
      expect(recordatoriosDeHoy(dia('2027-02-23'))).toContainEqual({
        tipo: 'PREVIO',
        periodo: '2027-03',
      });
      expect(recordatoriosDeHoy(dia('2027-02-22'))).not.toContainEqual(
        expect.objectContaining({ tipo: 'PREVIO' }),
      );
    });

    it('a fin de diciembre, el previo es el de enero del año siguiente', () => {
      expect(recordatoriosDeHoy(dia('2037-12-31'))).toContainEqual({
        tipo: 'PREVIO',
        periodo: '2038-01',
      });
    });
  });

  describe('lo que dicen', () => {
    const SOCIO = { nombre: 'Ana', email: 'ana@ejemplo.cl' };
    const WEB = 'https://fedal.cl';
    const FIRMA = '-- \nFEDAL Tennis Center';

    it('el previo avisa la cuota del mes siguiente y dónde pagarla', () => {
      const { asunto, cuerpo } = recordatorioPrevio(
        SOCIO,
        '2037-11',
        WEB,
        FIRMA,
      );

      expect(asunto).toBe('Tu cuota de noviembre');
      expect(cuerpo).toContain('Hola Ana:');
      expect(cuerpo).toContain(
        'El 1 de noviembre se emite tu cuota de noviembre',
      );
      expect(cuerpo).toContain('https://fedal.cl/mi-cuenta');
      expect(cuerpo.endsWith(FIRMA)).toBe(true);
    });

    it('**el vencido dice qué está pendiente y que sin pagarlo no se reserva**', () => {
      const { asunto, cuerpo } = recordatorioVencido(
        SOCIO,
        { mensual: true, incorporacion: false },
        WEB,
        FIRMA,
      );

      expect(asunto).toBe('Tienes la cuota pendiente');
      expect(cuerpo).toContain('Tienes pendiente la cuota mensual.');
      expect(cuerpo).toContain('no puedes reservar canchas');
      expect(cuerpo).toContain('https://fedal.cl/mi-cuenta');
    });

    it('**la incorporación impaga se nombra**, también si la mensual está al día', () => {
      expect(
        recordatorioVencido(
          SOCIO,
          { mensual: false, incorporacion: true },
          WEB,
          FIRMA,
        ).cuerpo,
      ).toContain('Tienes pendiente la incorporación.');
      expect(
        recordatorioVencido(
          SOCIO,
          { mensual: true, incorporacion: true },
          WEB,
          FIRMA,
        ).cuerpo,
      ).toContain('Tienes pendiente la cuota mensual y la incorporación.');
    });
  });
});
