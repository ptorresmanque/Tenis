import { EstadoSocio } from '../generated/prisma/client';
import { evaluarReservaDeSocio, SolicitudDeSocio } from './cupo';

/**
 * T22. Las reglas del socio, y sobre todo **el orden en que se le informan**.
 *
 * Quien está suspendido y además pasado de cupo tiene que leer que está suspendido:
 * es lo que puede resolver. Colapsar los rechazos en un "no puedes reservar" manda al
 * socio a pagar una cuota que ya pagó, o a reclamar por una suspensión que no existe.
 */
describe('evaluarReservaDeSocio', () => {
  // Lunes 17 de agosto de 2026, 19:00 en el club (23:00Z: Chile en UTC-4).
  const LUNES_19 = new Date('2026-08-17T23:00:00.000Z');
  const HOY = '2026-08-17';

  const solicitud = (
    parche: Partial<SolicitudDeSocio> = {},
  ): SolicitudDeSocio => ({
    socio: {
      id: 7,
      estado: EstadoSocio.ACTIVO,
      alDiaHasta: new Date('2026-12-31T00:00:00.000Z'),
      sancionadoHasta: null,
    },
    bloque: {
      inicio: LUNES_19,
      fin: new Date('2026-08-18T00:00:00.000Z'),
      esPico: false,
    },
    hoyEnElClub: HOY,
    config: {
      cupoDiarioSocioHoras: 1,
      cupoPicoSemanalHoras: 2,
      invitadosPorMes: 4,
    },
    reservasDelDia: 0,
    horasPicoDeLaSemana: 0,
    invitadosDelMes: 0,
    acompanantes: [{ nombre: 'Ana Invitada' }],
    ocupados: [],
    ...parche,
  });

  it('un socio al día, dentro del cupo y con acompañante, puede reservar', () => {
    expect(evaluarReservaDeSocio(solicitud())).toBeNull();
  });

  describe('membresía y morosidad son rechazos distintos', () => {
    it('el socio suspendido no oye hablar de la cuota', () => {
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          socio: {
            id: 7,
            estado: EstadoSocio.SUSPENDIDO,
            alDiaHasta: new Date('2026-12-31T00:00:00.000Z'),
            sancionadoHasta: null,
          },
        }),
      );

      expect(rechazo?.tipo).toBe('MEMBRESIA_INACTIVA');
      expect(rechazo?.mensaje).not.toMatch(/cuota/i);
    });

    it('el socio moroso oye hablar de la cuota y de hasta cuándo estuvo al día', () => {
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          socio: {
            id: 7,
            estado: EstadoSocio.ACTIVO,
            alDiaHasta: new Date('2026-07-31T00:00:00.000Z'),
            sancionadoHasta: null,
          },
        }),
      );

      expect(rechazo?.tipo).toBe('CUOTA_VENCIDA');
      expect(rechazo?.mensaje).toMatch(/cuota/i);
      expect(rechazo?.mensaje).toMatch(/31-07-2026/);
    });

    it('suspendido Y moroso a la vez: manda la suspensión', () => {
      // El cruce que pide el criterio. La cuota no le sirve de nada a quien tiene la
      // membresía suspendida: primero se levanta la suspensión.
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          socio: {
            id: 7,
            estado: EstadoSocio.SUSPENDIDO,
            alDiaHasta: new Date('2026-07-31T00:00:00.000Z'),
            sancionadoHasta: null,
          },
        }),
      );

      expect(rechazo?.tipo).toBe('MEMBRESIA_INACTIVA');
    });

    it('el día en que vence la cuota todavía cuenta como al día', () => {
      // El mismo borde que `socioAlDia` en T8: con `<` en vez de `<=`, el socio queda
      // moroso a las 00:00 del día que pagó y se entera cuando le rechazan la reserva
      // de esa tarde.
      expect(
        evaluarReservaDeSocio(
          solicitud({
            socio: {
              id: 7,
              estado: EstadoSocio.ACTIVO,
              alDiaHasta: new Date('2026-08-17T00:00:00.000Z'),
              sancionadoHasta: null,
            },
          }),
        ),
      ).toBeNull();
    });
  });

  describe('cupos', () => {
    it('la segunda reserva del día se rechaza, diciendo el límite y cuándo se renueva', () => {
      const rechazo = evaluarReservaDeSocio(solicitud({ reservasDelDia: 1 }));

      expect(rechazo?.tipo).toBe('CUPO_DIARIO');
      // "Límite alcanzado" a secas obliga a adivinar cuál es el límite y hasta cuándo.
      expect(rechazo?.mensaje).toMatch(/1 hora/);
      expect(rechazo?.mensaje).toMatch(/mañana/i);
    });

    it('la tercera hora pico de la semana se rechaza', () => {
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          bloque: {
            inicio: LUNES_19,
            fin: new Date('2026-08-18T00:00:00.000Z'),
            esPico: true,
          },
          horasPicoDeLaSemana: 2,
        }),
      );

      expect(rechazo?.tipo).toBe('CUPO_PICO');
      expect(rechazo?.mensaje).toMatch(/lunes/i);
    });

    it('las horas pico gastadas no bloquean un bloque valle', () => {
      // Solo cuentan los bloques con `esPico`. Si el cupo pico frenara una hora valle,
      // el socio que juega temprano quedaría sin poder reservar por algo que no usó.
      expect(
        evaluarReservaDeSocio(solicitud({ horasPicoDeLaSemana: 5 })),
      ).toBeNull();
    });

    it('el cupo sale de la configuración: con 3 horas pico, la tercera pasa', () => {
      // El criterio de verificación de T22: cambiar el número cambia el
      // comportamiento sin tocar código.
      const conTresHoras = solicitud({
        bloque: {
          inicio: LUNES_19,
          fin: new Date('2026-08-18T00:00:00.000Z'),
          esPico: true,
        },
        horasPicoDeLaSemana: 2,
        config: {
          cupoDiarioSocioHoras: 1,
          cupoPicoSemanalHoras: 3,
          invitadosPorMes: 4,
        },
      });

      expect(evaluarReservaDeSocio(conTresHoras)).toBeNull();
    });

    it('el cupo diario también sale de la configuración', () => {
      expect(
        evaluarReservaDeSocio(
          solicitud({
            reservasDelDia: 1,
            config: {
              cupoDiarioSocioHoras: 2,
              cupoPicoSemanalHoras: 2,
              invitadosPorMes: 4,
            },
          }),
        ),
      ).toBeNull();
    });
  });

  describe('con quién juega', () => {
    it('sin acompañante declarado no hay reserva', () => {
      const rechazo = evaluarReservaDeSocio(solicitud({ acompanantes: [] }));

      expect(rechazo?.tipo).toBe('SIN_ACOMPANANTE');
    });

    it('declararse a sí mismo no cuenta', () => {
      // Es la forma obvia de cumplir el trámite sin decir nada.
      const rechazo = evaluarReservaDeSocio(
        solicitud({ acompanantes: [{ socioId: 7 }] }),
      );

      expect(rechazo?.tipo).toBe('ACOMPANANTE_ES_TITULAR');
    });

    it('otro socio sí cuenta como acompañante', () => {
      expect(
        evaluarReservaDeSocio(solicitud({ acompanantes: [{ socioId: 8 }] })),
      ).toBeNull();
    });
  });

  describe('invitados del mes (T25)', () => {
    // Solo cuentan los externos: el socio acompañante es un registro, no un invitado,
    // y ya tiene su propia membresía pagada.
    it('el quinto invitado del mes se rechaza', () => {
      const rechazo = evaluarReservaDeSocio(solicitud({ invitadosDelMes: 4 }));

      expect(rechazo?.tipo).toBe('CUPO_INVITADOS');
    });

    it('el mensaje dice cuántos lleva, cuál es el límite y cuándo se renueva', () => {
      // "Límite alcanzado" a secas obliga a llamar al club para saber cuántos van.
      const rechazo = evaluarReservaDeSocio(solicitud({ invitadosDelMes: 4 }));

      expect(rechazo?.mensaje).toMatch(/4 de 4/);
      expect(rechazo?.mensaje).toMatch(/1 de septiembre/i);
    });

    it('el cuarto invitado del mes todavía pasa', () => {
      expect(
        evaluarReservaDeSocio(solicitud({ invitadosDelMes: 3 })),
      ).toBeNull();
    });

    it('anuncia la renovación del mes del bloque, no la del mes de hoy', () => {
      // El cupo se cuenta contra el mes en que se va a jugar. Midiendo la renovación
      // contra hoy, quien reserva en agosto una hora de septiembre con su cupo de
      // septiembre agotado lee "se renueva el 1 de septiembre": una fecha que llega sin
      // devolverle nada, porque esos invitados vuelven el 1 de octubre.
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          hoyEnElClub: '2026-08-20',
          bloque: {
            inicio: new Date('2026-09-05T22:00:00.000Z'),
            fin: new Date('2026-09-05T23:00:00.000Z'),
            esPico: false,
          },
          invitadosDelMes: 4,
        }),
      );

      expect(rechazo?.mensaje).toMatch(/1 de octubre/i);
    });

    it('cuando declara más de los que le quedan, el mensaje dice cuántos declaró', () => {
      // "Llevas 2 de 4" junto a un rechazo se lee como una falla del sistema: la
      // persona ve que le sobran dos cupos y que igual no la dejan reservar.
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          invitadosDelMes: 2,
          acompanantes: [
            { nombre: 'Ana' },
            { nombre: 'Beto' },
            { nombre: 'Carla' },
          ],
        }),
      );

      expect(rechazo?.mensaje).toMatch(/3 invitados/);
      expect(rechazo?.mensaje).toMatch(/2 de tus 4/);
    });

    it('cuenta los invitados de esta misma reserva, no solo los anteriores', () => {
      // Le quedan dos y declara tres de una vez. Mirando solo el historial pasaría, y
      // el mes terminaría con cinco invitados registrados.
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          invitadosDelMes: 2,
          acompanantes: [
            { nombre: 'Ana' },
            { nombre: 'Beto' },
            { nombre: 'Carla' },
          ],
        }),
      );

      expect(rechazo?.tipo).toBe('CUPO_INVITADOS');
    });

    it('los socios acompañantes no gastan invitados', () => {
      // Con el cupo mensual agotado, jugar con otro socio sigue siendo posible: es lo
      // que hace que el límite no se lea como "no puedes reservar más este mes".
      expect(
        evaluarReservaDeSocio(
          solicitud({ invitadosDelMes: 4, acompanantes: [{ socioId: 8 }] }),
        ),
      ).toBeNull();
    });

    it('el límite sale de la configuración', () => {
      expect(
        evaluarReservaDeSocio(
          solicitud({
            invitadosDelMes: 4,
            config: {
              cupoDiarioSocioHoras: 1,
              cupoPicoSemanalHoras: 2,
              invitadosPorMes: 8,
            },
          }),
        ),
      ).toBeNull();
    });
  });

  describe('nadie está en dos canchas a la vez', () => {
    const ocupado = (parche = {}) => ({
      socioId: 8,
      nombre: 'Camila Soto',
      cancha: 'Cancha 2',
      inicio: new Date('2026-08-17T23:00:00.000Z'),
      fin: new Date('2026-08-18T00:00:00.000Z'),
      ...parche,
    });

    it('rechaza al acompañante que ya está declarado en otra cancha a esa hora', () => {
      const rechazo = evaluarReservaDeSocio(
        solicitud({ acompanantes: [{ socioId: 8 }], ocupados: [ocupado()] }),
      );

      expect(rechazo?.tipo).toBe('YA_ESTA_EN_OTRA_CANCHA');
      // El mensaje nombra a quién y dónde: con cuatro jugadores declarados, un
      // "conflicto de horario" obliga a adivinar cuál de los cuatro es el problema.
      expect(rechazo?.mensaje).toMatch(/Camila Soto/);
      expect(rechazo?.mensaje).toMatch(/Cancha 2/);
    });

    it('rechaza también al titular que ya está en otra cancha', () => {
      // La regla nace del acompañante pero vale igual para el titular: son la misma
      // afirmación, y sostener una sin la otra deja el registro falseable.
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          ocupados: [ocupado({ socioId: 7, nombre: 'El titular' })],
        }),
      );

      expect(rechazo?.tipo).toBe('YA_ESTA_EN_OTRA_CANCHA');
    });

    it('detecta el solapamiento aunque los bloques no empiecen a la misma hora', () => {
      // Con `duracionBloqueMin` en 90, dos reservas que empiezan distinto se pisan
      // igual. Comparar solo la hora de inicio dejaría pasar el caso.
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          acompanantes: [{ socioId: 8 }],
          ocupados: [
            ocupado({
              inicio: new Date('2026-08-17T23:30:00.000Z'),
              fin: new Date('2026-08-18T01:00:00.000Z'),
            }),
          ],
        }),
      );

      expect(rechazo?.tipo).toBe('YA_ESTA_EN_OTRA_CANCHA');
    });

    it('dos bloques que apenas se tocan no se pisan', () => {
      // El anterior termina justo cuando este empieza: se puede jugar seguido en dos
      // canchas. Con bordes inclusivos, nadie podría encadenar dos horas.
      expect(
        evaluarReservaDeSocio(
          solicitud({
            acompanantes: [{ socioId: 8 }],
            ocupados: [
              ocupado({
                inicio: new Date('2026-08-17T22:00:00.000Z'),
                fin: new Date('2026-08-17T23:00:00.000Z'),
              }),
            ],
          }),
        ),
      ).toBeNull();
    });

    it('un invitado externo homónimo no bloquea a nadie', () => {
      // Los invitados no tienen identidad: dos "Juan Pérez" invitados el mismo día no
      // son la misma persona, y tratarlos como tal rechazaría reservas legítimas.
      expect(
        evaluarReservaDeSocio(
          solicitud({
            acompanantes: [{ nombre: 'Camila Soto' }],
            ocupados: [ocupado()],
          }),
        ),
      ).toBeNull();
    });
  });

  describe('sanción por una hora no usada (T34)', () => {
    const sancionadoHasta = (fecha: string) => ({
      socio: {
        id: 7,
        estado: EstadoSocio.ACTIVO,
        alDiaHasta: new Date('2026-12-31T00:00:00.000Z'),
        sancionadoHasta: new Date(`${fecha}T00:00:00.000Z`),
      },
    });

    it('el socio sancionado no puede reservar, y el mensaje dice hasta cuándo', () => {
      const rechazo = evaluarReservaDeSocio(
        solicitud(sancionadoHasta('2026-09-01')),
      );

      expect(rechazo?.tipo).toBe('SANCIONADO');
      // La fecha en el mensaje: "estás sancionado" a secas deja a la persona
      // probando todos los días a ver si ya puede.
      expect(rechazo?.mensaje).toContain('01-09-2026');
    });

    it('el último día sancionado todavía no puede', () => {
      // Hoy es el 17 y la sanción llega "hasta el 17": ese día no reserva. El
      // borde tiene test porque un `>` en vez de `>=` le devolvería un día.
      expect(
        evaluarReservaDeSocio(solicitud(sancionadoHasta('2026-08-17')))?.tipo,
      ).toBe('SANCIONADO');
    });

    it('al día siguiente vuelve a reservar', () => {
      expect(
        evaluarReservaDeSocio(solicitud(sancionadoHasta('2026-08-16'))),
      ).toBeNull();
    });

    it('sin sanción, no molesta a nadie', () => {
      expect(evaluarReservaDeSocio(solicitud())).toBeNull();
    });

    it('la sanción gana a la cuota vencida', () => {
      // **El orden que fija la spec.** Quien está sancionado y además moroso tiene
      // que leer que está sancionado: pagar la cuota no le devuelve el derecho a
      // reservar, y el mensaje de la cuota lo mandaría a pagar para nada.
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          socio: {
            id: 7,
            estado: EstadoSocio.ACTIVO,
            alDiaHasta: new Date('2026-07-31T00:00:00.000Z'),
            sancionadoHasta: new Date('2026-09-01T00:00:00.000Z'),
          },
        }),
      );

      expect(rechazo?.tipo).toBe('SANCIONADO');
    });

    it('la membresía inactiva gana a la sanción', () => {
      // Al revés que la cuota: quien está suspendido tiene un problema más grande
      // y una conversación distinta con el club.
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          socio: {
            id: 7,
            estado: EstadoSocio.SUSPENDIDO,
            alDiaHasta: new Date('2026-12-31T00:00:00.000Z'),
            sancionadoHasta: new Date('2026-09-01T00:00:00.000Z'),
          },
        }),
      );

      expect(rechazo?.tipo).toBe('MEMBRESIA_INACTIVA');
    });
  });

  describe('el orden de los rechazos', () => {
    it('la suspensión gana al cupo', () => {
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          socio: {
            id: 7,
            estado: EstadoSocio.SUSPENDIDO,
            alDiaHasta: new Date('2026-12-31T00:00:00.000Z'),
            sancionadoHasta: null,
          },
          reservasDelDia: 3,
        }),
      );

      expect(rechazo?.tipo).toBe('MEMBRESIA_INACTIVA');
    });

    it('la morosidad gana al acompañante que falta', () => {
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          socio: {
            id: 7,
            estado: EstadoSocio.ACTIVO,
            alDiaHasta: new Date('2026-07-31T00:00:00.000Z'),
            sancionadoHasta: null,
          },
          acompanantes: [],
        }),
      );

      expect(rechazo?.tipo).toBe('CUOTA_VENCIDA');
    });

    it('el cupo diario gana al pico', () => {
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          bloque: {
            inicio: LUNES_19,
            fin: new Date('2026-08-18T00:00:00.000Z'),
            esPico: true,
          },
          reservasDelDia: 1,
          horasPicoDeLaSemana: 2,
        }),
      );

      // Los dos rechazan, pero el diario es el que se topa primero y el que explica
      // por qué no puede reservar hoy en ningún horario.
      expect(rechazo?.tipo).toBe('CUPO_DIARIO');
    });

    it('estar en otra cancha gana al cupo de invitados', () => {
      // El orden del spec: el conflicto de horario es el paso 8 y los invitados el 9.
      // Importa porque el choque de horario se arregla eligiendo otra hora, y el cupo
      // mensual no se arregla con nada hasta el día 1.
      const rechazo = evaluarReservaDeSocio(
        solicitud({
          invitadosDelMes: 4,
          acompanantes: [{ socioId: 8 }, { nombre: 'Ana Invitada' }],
          ocupados: [
            {
              socioId: 8,
              nombre: 'Camila Soto',
              cancha: 'Cancha 2',
              inicio: LUNES_19,
              fin: new Date('2026-08-18T00:00:00.000Z'),
            },
          ],
        }),
      );

      expect(rechazo?.tipo).toBe('YA_ESTA_EN_OTRA_CANCHA');
    });
  });
});
