import { DatosDelClub, firmaDelClub } from '../comun/club';
import { avisoDeCambio, confirmacionDeReserva } from './correos';

/**
 * T108 y T109. Lo que dicen la confirmación y el aviso de cambio; la firma se prueba en
 * `comun/club.spec.ts`. Que el correo salga una sola vez se prueba contra la base, en
 * `reservas-no-socio.spec.ts` y `reservas-socio.spec.ts`.
 */
describe('correos de la reserva', () => {
  const CLUB: DatosDelClub = {
    nombre: 'FEDAL Tennis Center',
    direccion: 'Avenida del Tenis 1234, Ñuñoa',
    telefono: '56223456789',
    email: 'hola@fedal.cl',
    latitud: -33.4372,
    longitud: -70.6506,
  };

  const VENTANAS = { horasMinModificacion: 6, horasReembolsoTotal: 24 };

  // Lunes 17 de agosto de 2037, de 10:00 a 11:00 en Santiago (UTC-4).
  const RESERVA = {
    folio: 'ABC1234',
    token: 'un-token-largo',
    cancha: 'Cancha 1',
    inicio: new Date('2037-08-17T14:00:00.000Z'),
    fin: new Date('2037-08-17T15:00:00.000Z'),
    nombre: 'Camila Visitante',
    conQuien: ['Beto Rival', 'Ana Fuentes'],
    deSocio: false,
  };

  const confirmacion = (parche: Partial<typeof RESERVA> = {}, club = CLUB) =>
    confirmacionDeReserva(
      { ...RESERVA, ...parche },
      club,
      VENTANAS,
      'https://fedal.cl',
    );

  describe('la confirmación', () => {
    it('**dice el folio, la cancha, el día, la hora y la duración, en la hora del club**', () => {
      const { cuerpo } = confirmacion();

      expect(cuerpo).toContain('Folio: ABC1234');
      expect(cuerpo).toContain('Cancha: Cancha 1');
      expect(cuerpo).toContain('lunes, 17 de agosto');
      expect(cuerpo).toContain('de 10:00 a 11:00 (1 hora)');
    });

    it('la de 1 hora y media lo dice así, no en minutos', () => {
      const { cuerpo } = confirmacion({
        fin: new Date('2037-08-17T15:30:00.000Z'),
      });

      expect(cuerpo).toContain('de 10:00 a 11:30 (1 hora y media)');
    });

    it('dice con quién juega', () => {
      expect(confirmacion().cuerpo).toContain(
        'Juegas con: Beto Rival y Ana Fuentes',
      );
    });

    it('**lleva el enlace de la reserva, el del QR de la entrada**', () => {
      expect(confirmacion().cuerpo).toContain(
        'https://fedal.cl/r/un-token-largo',
      );
    });

    it('el asunto dice el día y la hora: es lo que se busca en la bandeja', () => {
      expect(confirmacion().asunto).toBe(
        'Reserva confirmada: lunes, 17 de agosto, a las 10:00',
      );
    });

    it('al visitante le dice que cambia desde el enlace y cómo es la devolución', () => {
      const { cuerpo } = confirmacion();

      expect(cuerpo).toContain('desde ese enlace hasta 6 horas antes');
      expect(cuerpo).toContain(
        'con 24 horas o más de anticipación te devolvemos',
      );
    });

    it('al socio, que cambia y cancela desde "Mis reservas", sin hablarle de plata', () => {
      const { cuerpo } = confirmacion({ deSocio: true });

      expect(cuerpo).toContain('desde "Mis reservas" hasta 6 horas antes');
      expect(cuerpo).not.toContain('devolvemos');
    });

    it('lo saluda por su nombre', () => {
      expect(confirmacion().cuerpo.startsWith('Hola Camila Visitante:')).toBe(
        true,
      );
    });
  });

  /** T109. Cada cambio de la reserva de un visitante se avisa a su correo. */
  describe('el aviso de cambio', () => {
    const aviso = () =>
      avisoDeCambio(
        {
          ...RESERVA,
          cancha: 'Cancha 2',
          fin: new Date('2037-08-17T15:30:00.000Z'),
        },
        {
          cancha: 'Cancha 1',
          inicio: new Date('2037-08-17T13:00:00.000Z'),
          fin: new Date('2037-08-17T14:00:00.000Z'),
        },
        CLUB,
        'https://fedal.cl',
      );

    it('**dice la hora de antes y la de después, con su cancha y su duración**', () => {
      const { cuerpo } = aviso();

      expect(cuerpo).toContain(
        'Antes: Cancha 1, lunes, 17 de agosto, de 09:00 a 10:00 (1 hora)',
      );
      expect(cuerpo).toContain(
        'Ahora: Cancha 2, lunes, 17 de agosto, de 10:00 a 11:30 (1 hora y media)',
      );
    });

    it('**dice que escriba si no pidió el cambio**: quien tenga el enlace reenviado puede moverla', () => {
      expect(aviso().cuerpo).toContain('Si no pediste este cambio, escríbenos');
    });

    it('lleva el enlace de la reserva y la firma', () => {
      const { cuerpo } = aviso();

      expect(cuerpo).toContain('https://fedal.cl/r/un-token-largo');
      expect(cuerpo.endsWith(firmaDelClub(CLUB))).toBe(true);
    });

    it('el asunto nombra el folio', () => {
      expect(aviso().asunto).toBe('Tu reserva ABC1234 cambió');
    });
  });

  describe('la firma del club', () => {
    it('la confirmación termina con la firma', () => {
      expect(confirmacion().cuerpo.endsWith(firmaDelClub(CLUB))).toBe(true);
    });
  });
});
