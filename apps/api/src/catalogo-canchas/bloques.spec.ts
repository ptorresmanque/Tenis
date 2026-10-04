import { calcularBloques } from './bloques';

/**
 * T10. La función que convierte "el club abre de 08:00 a 22:00" en la lista de
 * bloques que la grilla muestra. Pura: no toca la base ni el reloj.
 *
 * Acá vive el bug de marzo. Los horarios se configuran en hora local del club y
 * los bloques salen en UTC; hacer esa conversión con un desfase fijo deja la
 * grilla corrida una hora medio año, y el día que aparece nadie lo relaciona con
 * el cambio de hora.
 */
describe('calcularBloques', () => {
  const dia = {
    fecha: '2026-08-17',
    horaApertura: '08:00',
    horaCierre: '22:00',
    duracionBloqueMin: 60,
  };

  it('parte de la hora de apertura y encadena bloques hasta el cierre', () => {
    const bloques = calcularBloques(dia);

    expect(bloques).toHaveLength(14);
    // 08:00 en Santiago en agosto son las 12:00Z.
    expect(bloques[0].inicio.toISOString()).toBe('2026-08-17T12:00:00.000Z');
    expect(bloques[0].fin.toISOString()).toBe('2026-08-17T13:00:00.000Z');
    expect(bloques[13].fin.toISOString()).toBe('2026-08-18T02:00:00.000Z');
  });

  it('deja cada bloque pegado al siguiente, sin huecos', () => {
    const bloques = calcularBloques(dia);

    for (let i = 1; i < bloques.length; i++) {
      expect(bloques[i].inicio).toEqual(bloques[i - 1].fin);
    }
  });

  it('cambiar la duración cambia la grilla y no queda nada a medias', () => {
    // El criterio de `ConfiguracionClub`: cambiar el número basta, sin migración.
    // 14 horas en bloques de 90 minutos dan 9 y sobra media hora, que se descarta:
    // media hora de cancha no se le puede vender a nadie.
    const bloques = calcularBloques({ ...dia, duracionBloqueMin: 90 });

    expect(bloques).toHaveLength(9);
    expect(bloques[8].fin.toISOString()).toBe('2026-08-18T01:30:00.000Z');
  });

  it('un día sin horas de apertura no tiene bloques', () => {
    expect(
      calcularBloques({ ...dia, horaApertura: '10:00', horaCierre: '10:00' }),
    ).toEqual([]);
  });

  it('admite un club que cierra a medianoche', () => {
    const bloques = calcularBloques({ ...dia, horaCierre: '24:00' });

    expect(bloques).toHaveLength(16);
    expect(bloques[15].fin.toISOString()).toBe('2026-08-18T04:00:00.000Z');
  });

  it('rechaza una duración de bloque que no avanza', () => {
    // Sin esto, un 0 en la configuración cuelga el proceso en un bucle infinito
    // en vez de fallar en la petición que lo trajo.
    expect(() => calcularBloques({ ...dia, duracionBloqueMin: 0 })).toThrow();
    expect(() => calcularBloques({ ...dia, duracionBloqueMin: -60 })).toThrow();
  });

  it('un horario ilegible falla en vez de parecer un día cerrado', () => {
    // Es la diferencia entre arreglar una fila y buscar durante una hora por qué
    // la grilla del martes sale vacía.
    expect(() => calcularBloques({ ...dia, horaApertura: '8:00' })).toThrow();
    expect(() => calcularBloques({ ...dia, horaCierre: '' })).toThrow();
    expect(() =>
      calcularBloques({ ...dia, horaApertura: '22:00', horaCierre: '08:00' }),
    ).toThrow();
  });

  describe('bloqueos', () => {
    const conBloqueo = (inicio: string, fin: string, motivo = 'MANTENCION') =>
      calcularBloques({
        ...dia,
        bloqueos: [
          {
            inicio: new Date(`2026-08-17T${inicio}:00.000Z`),
            fin: new Date(`2026-08-17T${fin}:00.000Z`),
            motivo,
          },
        ],
      });

    const bloqueados = (bloques: ReturnType<typeof calcularBloques>) =>
      bloques.filter((b) => b.bloqueado).map((b) => b.inicio.toISOString());

    it('un bloqueo de dos horas marca exactamente dos bloques', () => {
      // 14:00 a 16:00Z son las 10:00 a 12:00 del reloj del club.
      const bloques = conBloqueo('14:00', '16:00');

      expect(bloqueados(bloques)).toEqual([
        '2026-08-17T14:00:00.000Z',
        '2026-08-17T15:00:00.000Z',
      ]);
    });

    it('un bloqueo que parte a mitad de un bloque lo marca completo', () => {
      // Media hora de cancha no le sirve a nadie: el bloque entero se cae.
      expect(bloqueados(conBloqueo('14:30', '15:00'))).toEqual([
        '2026-08-17T14:00:00.000Z',
      ]);
    });

    it('un bloqueo que termina justo cuando empieza un bloque no lo toca', () => {
      // El borde exacto. Sin esta regla, todo bloqueo se come un bloque de más.
      expect(bloqueados(conBloqueo('13:00', '14:00'))).toEqual([
        '2026-08-17T13:00:00.000Z',
      ]);
    });

    it('un bloqueo fuera del horario no marca nada', () => {
      expect(bloqueados(conBloqueo('02:00', '04:00'))).toEqual([]);
    });

    it('el bloque bloqueado dice por qué', () => {
      const bloques = conBloqueo('14:00', '15:00', 'TORNEO');

      expect(bloques.find((b) => b.bloqueado)?.motivoBloqueo).toBe('TORNEO');
      expect(bloques.find((b) => !b.bloqueado)?.motivoBloqueo).toBeNull();
    });

    it('con varios bloqueos, marca los bloques de todos', () => {
      const bloques = calcularBloques({
        ...dia,
        bloqueos: [
          {
            inicio: new Date('2026-08-17T14:00:00.000Z'),
            fin: new Date('2026-08-17T15:00:00.000Z'),
            motivo: 'MANTENCION',
          },
          {
            inicio: new Date('2026-08-17T20:00:00.000Z'),
            fin: new Date('2026-08-17T21:00:00.000Z'),
            motivo: 'CLASE',
          },
        ],
      });

      expect(bloqueados(bloques)).toEqual([
        '2026-08-17T14:00:00.000Z',
        '2026-08-17T20:00:00.000Z',
      ]);
    });
  });

  /**
   * T78. Se reserva empezando cada media hora: la grilla ya no es una fila de bloques
   * pegados sino la lista de inicios posibles, cada uno con su fin. Ver
   * `SPEC-catalogo-canchas.md` § La grilla: un inicio cada media hora.
   */
  describe('un inicio cada media hora', () => {
    const hora = (instante: Date) =>
      instante.toLocaleTimeString('es-CL', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    const cadaMediaHora = { ...dia, pasoMin: 30 };

    it('de 1 hora: 27 inicios de 08:00 a 21:00, y ninguno termina después del cierre', () => {
      const bloques = calcularBloques(cadaMediaHora);

      expect(bloques).toHaveLength(27);
      expect([hora(bloques[0].inicio), hora(bloques[0].fin)]).toEqual([
        '08:00',
        '09:00',
      ]);
      expect([hora(bloques[1].inicio), hora(bloques[1].fin)]).toEqual([
        '08:30',
        '09:30',
      ]);
      expect([hora(bloques[26].inicio), hora(bloques[26].fin)]).toEqual([
        '21:00',
        '22:00',
      ]);
    });

    it('de 1 hora y media: 26 inicios, el último a las 20:30', () => {
      const bloques = calcularBloques({
        ...cadaMediaHora,
        duracionBloqueMin: 90,
      });

      expect(bloques).toHaveLength(26);
      expect([hora(bloques[25].inicio), hora(bloques[25].fin)]).toEqual([
        '20:30',
        '22:00',
      ]);
    });

    it('un bloqueo de 10:00 a 12:00 marca los inicios cuyo rango lo toca, ni uno más', () => {
      const bloqueos = [
        {
          inicio: new Date('2026-08-17T14:00:00.000Z'), // 10:00 en Santiago
          fin: new Date('2026-08-17T16:00:00.000Z'), // 12:00
          motivo: 'MANTENCION',
        },
      ];
      const bloqueados = (duracionBloqueMin: number) =>
        calcularBloques({ ...cadaMediaHora, duracionBloqueMin, bloqueos })
          .filter((b) => b.bloqueado)
          .map((b) => hora(b.inicio));

      // El de 09:00 termina justo a las 10:00 y el de 12:00 empieza justo al final:
      // los bordes exactos no cuentan.
      expect(bloqueados(60)).toEqual([
        '09:30',
        '10:00',
        '10:30',
        '11:00',
        '11:30',
      ]);
      expect(bloqueados(90)).toEqual([
        '09:00',
        '09:30',
        '10:00',
        '10:30',
        '11:00',
        '11:30',
      ]);
    });

    it('un bloqueo de media hora marca todos los inicios que lo tocan, no solo el que empieza con él', () => {
      const bloqueos = [
        {
          inicio: new Date('2026-08-17T15:00:00.000Z'), // 11:00
          fin: new Date('2026-08-17T15:30:00.000Z'), // 11:30
          motivo: 'MANTENCION',
        },
      ];

      const bloqueados = calcularBloques({ ...cadaMediaHora, bloqueos })
        .filter((b) => b.bloqueado)
        .map((b) => hora(b.inicio));

      expect(bloqueados).toEqual(['10:30', '11:00']);
    });

    it('rechaza una duración que no es múltiplo del paso', () => {
      // 45 minutos cada media hora dejaría inicios cuyo fin no cae en ningún borde.
      expect(() =>
        calcularBloques({ ...cadaMediaHora, duracionBloqueMin: 45 }),
      ).toThrow(/múltiplo/);
    });

    it('**en los dos domingos de cambio de hora, y en el sábado que repite las 23:00, ningún rango termina antes de empezar**', () => {
      // Obligatorio (`SPEC-catalogo-canchas.md` § Success Criteria 5). Con inicios cada
      // media hora, los rangos se pisan entre sí y el fin de uno ya no es el inicio del
      // siguiente: un error de zona horaria podría dejar un fin antes de su inicio.
      const casos = [
        { fecha: '2026-04-05', horaApertura: '09:00', horaCierre: '20:00' },
        { fecha: '2026-09-06', horaApertura: '09:00', horaCierre: '20:00' },
        { fecha: '2026-04-04', horaApertura: '22:00', horaCierre: '24:00' },
        { fecha: '2026-09-05', horaApertura: '22:00', horaCierre: '24:00' },
      ];

      for (const caso of casos) {
        for (const duracionBloqueMin of [60, 90]) {
          const bloques = calcularBloques({
            ...caso,
            duracionBloqueMin,
            pasoMin: 30,
          });

          for (const bloque of bloques) {
            expect([caso.fecha, bloque.fin > bloque.inicio]).toEqual([
              caso.fecha,
              true,
            ]);
          }
        }
      }

      const atrasa = calcularBloques({
        ...dia,
        ...casos[0],
        pasoMin: 30,
      });
      expect(atrasa).toHaveLength(21);
      expect(atrasa[0].inicio.toISOString()).toBe('2026-04-05T13:00:00.000Z');
      expect(atrasa[20].fin.toISOString()).toBe('2026-04-06T00:00:00.000Z');

      const adelanta = calcularBloques({
        ...dia,
        ...casos[1],
        pasoMin: 30,
      });
      expect(adelanta).toHaveLength(21);
      expect(adelanta[0].inicio.toISOString()).toBe('2026-09-06T12:00:00.000Z');
      expect(adelanta[20].fin.toISOString()).toBe('2026-09-06T23:00:00.000Z');
    });
  });

  /**
   * El test obligatorio de `SPEC-catalogo-canchas.md` § Zona horaria. No basta con
   * contar bloques: la cantidad sale igual con un desfase fijo, porque en Chile el
   * salto ocurre a medianoche. Lo que delata el error es el instante de cada uno.
   */
  describe('los domingos en que Chile cambia la hora', () => {
    const domingo = { ...dia, horaApertura: '09:00', horaCierre: '20:00' };

    it('el domingo que atrasa el reloj devuelve 11 bloques, en UTC-4', () => {
      const bloques = calcularBloques({ ...domingo, fecha: '2026-04-05' });

      expect(bloques).toHaveLength(11);
      expect(bloques[0].inicio.toISOString()).toBe('2026-04-05T13:00:00.000Z');
      expect(bloques[10].fin.toISOString()).toBe('2026-04-06T00:00:00.000Z');
    });

    it('el domingo que adelanta el reloj devuelve 11 bloques, en UTC-3', () => {
      const bloques = calcularBloques({ ...domingo, fecha: '2026-09-06' });

      expect(bloques).toHaveLength(11);
      expect(bloques[0].inicio.toISOString()).toBe('2026-09-06T12:00:00.000Z');
      expect(bloques[10].fin.toISOString()).toBe('2026-09-06T23:00:00.000Z');
    });

    it('el sábado anterior al cambio de otoño dura una hora más', () => {
      // El 4 de abril el reloj repite las 23:00, así que del cierre de un día a la
      // apertura del siguiente pasa una hora más que en cualquier otro día. Si los
      // bloques se generaran sumando minutos al instante de apertura en vez de
      // avanzar el reloj local, el sábado terminaría a la hora equivocada.
      const sabado = calcularBloques({
        fecha: '2026-04-04',
        horaApertura: '22:00',
        horaCierre: '24:00',
        duracionBloqueMin: 60,
      });

      expect(sabado).toHaveLength(2);
      expect(sabado[0].inicio.toISOString()).toBe('2026-04-05T01:00:00.000Z');
      // El segundo bloque dura dos horas reales: entre las 23:00 y las 24:00 del
      // reloj, esa noche, pasan dos horas de verdad.
      expect(sabado[1].inicio.toISOString()).toBe('2026-04-05T02:00:00.000Z');
      expect(sabado[1].fin.toISOString()).toBe('2026-04-05T04:00:00.000Z');
    });
  });
});
