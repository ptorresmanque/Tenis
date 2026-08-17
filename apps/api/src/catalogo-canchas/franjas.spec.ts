import { FranjaCandidata, franjaPara } from './franjas';

/**
 * T11. Qué cuesta un bloque y si limita el cupo del socio.
 *
 * Las dos cosas salen de la misma fila a propósito (`SPEC-catalogo-canchas.md` §
 * Modelo de datos): resolverlas por separado permite que un socio pierda cupo pico
 * en una hora que se le cobra como valle, y ese desajuste no lo nota nadie hasta
 * que un socio reclama.
 */
describe('franjaPara', () => {
  const LUNES = '2026-08-17';

  /** Una franja para toda cancha y todo día, vigente desde siempre. */
  const franja = (parche: Partial<FranjaCandidata> = {}): FranjaCandidata => ({
    id: 1,
    canchaId: null,
    diaSemana: null,
    horaDesde: '08:00',
    horaHasta: '18:00',
    esPico: false,
    montoClp: 12000,
    vigenteDesde: new Date('2026-01-01T00:00:00.000Z'),
    vigenteHasta: null,
    ...parche,
  });

  /** El bloque de las 10:00 del reloj del club, que en agosto son las 14:00Z. */
  const alasDiez = (franjas: FranjaCandidata[]) =>
    franjaPara({
      fecha: LUNES,
      canchaId: 7,
      inicio: new Date('2026-08-17T14:00:00.000Z'),
      franjas,
    });

  it('un bloque sin ninguna franja que lo cubra es gratis y no es pico', () => {
    // El admin lo ve como advertencia en el panel (T13): casi siempre significa
    // que olvidó una franja, no que quiso regalar la cancha.
    expect(alasDiez([])).toEqual({ montoClp: 0, esPico: false });
  });

  it('toma el precio y el pico de la franja que lo cubre', () => {
    expect(alasDiez([franja({ montoClp: 15000, esPico: true })])).toEqual({
      montoClp: 15000,
      esPico: true,
    });
  });

  it('ignora una franja que empieza después del bloque', () => {
    expect(
      alasDiez([franja({ horaDesde: '18:00', horaHasta: '22:00' })]),
    ).toEqual({ montoClp: 0, esPico: false });
  });

  it('la franja termina donde dice: el bloque de las 18:00 ya no es suyo', () => {
    // El borde exacto. Con `<=`, las franjas de 08–18 y 18–22 se pisan y el precio
    // de las 18:00 depende del orden en que vengan de la base.
    const alasSeis = franjaPara({
      fecha: LUNES,
      canchaId: 7,
      inicio: new Date('2026-08-17T22:00:00.000Z'),
      franjas: [franja({ horaDesde: '08:00', horaHasta: '18:00' })],
    });

    expect(alasSeis).toEqual({ montoClp: 0, esPico: false });
  });

  describe('vigencia', () => {
    it('ignora una franja que todavía no empieza a regir', () => {
      expect(
        alasDiez([
          franja({ vigenteDesde: new Date('2026-12-01T00:00:00.000Z') }),
        ]),
      ).toEqual({ montoClp: 0, esPico: false });
    });

    it('ignora una franja que ya venció', () => {
      expect(
        alasDiez([
          franja({ vigenteHasta: new Date('2026-08-16T00:00:00.000Z') }),
        ]),
      ).toEqual({ montoClp: 0, esPico: false });
    });

    it('el último día de vigencia todavía cuenta', () => {
      // Igual que `alDiaHasta` en identidad: el día que dice el papel es el último
      // que vale, no el primero que no.
      expect(
        alasDiez([
          franja({ vigenteHasta: new Date('2026-08-17T00:00:00.000Z') }),
        ]),
      ).toMatchObject({ montoClp: 12000 });
    });
  });

  describe('especificidad', () => {
    const general = franja({ id: 1, montoClp: 10000 });

    it('la franja de otra cancha no aplica', () => {
      expect(alasDiez([franja({ canchaId: 99, montoClp: 99000 })])).toEqual({
        montoClp: 0,
        esPico: false,
      });
    });

    it('la de esta cancha gana a la de todas', () => {
      expect(
        alasDiez([general, franja({ id: 2, canchaId: 7, montoClp: 20000 })]),
      ).toMatchObject({ montoClp: 20000 });
    });

    it('la de este día gana a la de todos los días', () => {
      // 2026-08-17 es lunes: día 1.
      expect(
        alasDiez([general, franja({ id: 2, diaSemana: 1, montoClp: 20000 })]),
      ).toMatchObject({ montoClp: 20000 });
    });

    it('el día es el del club, aunque en UTC ya sea el siguiente', () => {
      // Un bloque de las 21:00 de un lunes en Santiago cae un martes en UTC. Sacar
      // el día de la semana del instante en vez de la fecha del club deja la tarifa
      // del lunes sin aplicarse justo en las horas de más demanda, todas las noches.
      const lunesPorLaNoche = franjaPara({
        fecha: LUNES,
        canchaId: 7,
        inicio: new Date('2026-08-18T01:00:00.000Z'),
        franjas: [
          franja({
            id: 2,
            diaSemana: 1,
            horaDesde: '18:00',
            horaHasta: '22:00',
            esPico: true,
            montoClp: 20000,
          }),
        ],
      });

      expect(lunesPorLaNoche).toEqual({ montoClp: 20000, esPico: true });
    });

    it('la cancha pesa más que el día', () => {
      // Decisión, no está en la spec: "esta cancha cuesta más" es una regla del
      // club más fuerte que "los lunes cuestan más". Sin un orden fijo, el precio
      // de un lunes en la cancha techada dependería del orden de la consulta.
      expect(
        alasDiez([
          franja({ id: 1, canchaId: 7, montoClp: 20000 }),
          franja({ id: 2, diaSemana: 1, montoClp: 30000 }),
        ]),
      ).toMatchObject({ montoClp: 20000 });
    });

    it('entre dos igual de específicas, gana la que empezó a regir después', () => {
      // El id de la ganadora es el menor a propósito: si la vigencia dejara de
      // desempatar, el desempate siguiente elegiría la otra y el test lo diría.
      // Con los ids al revés, este test pasa sin que la regla exista.
      expect(
        alasDiez([
          franja({
            id: 9,
            montoClp: 10000,
            vigenteDesde: new Date('2026-01-01T00:00:00.000Z'),
          }),
          franja({
            id: 2,
            montoClp: 14000,
            vigenteDesde: new Date('2026-06-01T00:00:00.000Z'),
          }),
        ]),
      ).toMatchObject({ montoClp: 14000 });
    });

    it('con la misma vigencia, gana la que se creó después', () => {
      // El último desempate. Sin él, dos franjas idénticas dan un precio distinto
      // según el orden en que la base las devuelva.
      //
      // La ganadora va segunda: si no hubiera desempate, quedaría la primera y el
      // test fallaría. Al revés pasaría sin probar nada.
      expect(
        alasDiez([
          franja({ id: 3, montoClp: 10000 }),
          franja({ id: 9, montoClp: 14000 }),
        ]),
      ).toMatchObject({ montoClp: 14000 });
    });
  });

  it('el precio y el pico vienen siempre de la misma franja', () => {
    // El criterio que da sentido a la tarea. La ganadora es la de la cancha, cara
    // y pico; la perdedora es barata y valle. Resolverlos por separado devolvería
    // el par cruzado y nadie lo notaría hasta que un socio pierda cupo.
    expect(
      alasDiez([
        franja({ id: 1, montoClp: 8000, esPico: false }),
        franja({ id: 2, canchaId: 7, montoClp: 25000, esPico: true }),
      ]),
    ).toEqual({ montoClp: 25000, esPico: true });
  });

  it('el domingo que Chile cambia la hora, la franja sigue siendo la correcta', () => {
    // La franja se guarda en hora local; el bloque llega en UTC. Comparar sin
    // convertir acierta medio año: el 5 de abril las 18:00 del club son las 22:00Z
    // y no las 21:00Z, así que un bloque de las 21:00Z todavía es valle.
    const antesDelPico = franjaPara({
      fecha: '2026-04-05',
      canchaId: 7,
      inicio: new Date('2026-04-05T21:00:00.000Z'),
      franjas: [
        franja({
          id: 1,
          horaDesde: '08:00',
          horaHasta: '18:00',
          montoClp: 12000,
        }),
        franja({
          id: 2,
          horaDesde: '18:00',
          horaHasta: '22:00',
          esPico: true,
          montoClp: 20000,
        }),
      ],
    });

    expect(antesDelPico).toEqual({ montoClp: 12000, esPico: false });
  });
});
