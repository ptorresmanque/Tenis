import { DatosDelClub, firmaDelClub } from '../comun/club';
import {
  avisoDeComprobante,
  cuadroArmado,
  cupoOfrecido,
  InscripcionParaAvisar,
  inscripcionRecibida,
  ofertaVencida,
  pagoAprobado,
  pagoRechazado,
  partidoCambiado,
  partidoProgramado,
  PartidoParaAvisar,
  partidoSinHora,
  quedasteDentro,
} from './correos';

/**
 * T130 y T131. Lo que dicen el aviso a los administradores y los correos al inscrito.
 * Cuándo salen y a quién se prueba contra la base, en `torneos-aviso-comprobante.spec.ts`
 * y `torneos-correos-inscrito.spec.ts`.
 */
describe('correos del torneo', () => {
  const CLUB: DatosDelClub = {
    nombre: 'FEDAL Tennis Center',
    direccion: 'Avenida del Tenis 1234, Ñuñoa',
    telefono: '56223456789',
    email: 'hola@fedal.cl',
    latitud: null,
    longitud: null,
  };

  const COMPROBANTE = {
    torneoId: 11,
    cuadroId: 42,
    torneo: 'Torneo Aniversario',
    categoria: '4ª',
    jugador: 'Camila Reyes',
    montoClp: 15_000,
  };

  const aviso = () => avisoDeComprobante(COMPROBANTE, CLUB, 'https://fedal.cl');

  it('**el asunto dice de quién y de qué categoría**: es lo que se busca en la bandeja', () => {
    expect(aviso().asunto).toBe('Comprobante por revisar: Camila Reyes, 4ª');
  });

  it('dice el torneo, la categoría, quién y cuánto', () => {
    const { cuerpo } = aviso();

    expect(cuerpo).toContain('Torneo: Torneo Aniversario');
    expect(cuerpo).toContain('Categoría: 4ª');
    expect(cuerpo).toContain('Jugador: Camila Reyes');
    expect(cuerpo).toContain('Monto: $15.000');
  });

  it('**enlaza a los inscritos de esa categoría en el panel**, para resolverlo ahí', () => {
    expect(aviso().cuerpo).toContain(
      'https://fedal.cl/administracion/torneos/11?cuadro=42',
    );
  });

  it('va firmado por el club', () => {
    expect(aviso().cuerpo).toContain(firmaDelClub(CLUB));
  });

  describe('al inscrito (T131)', () => {
    const INSCRIPCION: InscripcionParaAvisar = {
      nombre: 'Camila',
      torneo: 'Torneo Aniversario',
      categoria: '4ª',
      montoClp: 15_000,
      estado: 'INSCRITA',
      estadoPago: 'EXENTA',
      medioPago: null,
      motivoRechazo: null,
      token: 'llave-de-camila',
      cupoOfrecidoHasta: null,
    };

    const recibida = (parche: Partial<InscripcionParaAvisar> = {}) =>
      inscripcionRecibida(
        { ...INSCRIPCION, ...parche },
        CLUB,
        'https://fedal.cl',
      );

    it('**la inscripción recibida dice el torneo y la categoría**, en el asunto también', () => {
      const { asunto, cuerpo } = recibida();

      expect(asunto).toBe('Inscripción recibida: Torneo Aniversario, 4ª');
      expect(cuerpo).toContain('Hola Camila:');
      expect(cuerpo).toContain(
        'Quedaste inscrito en 4ª de Torneo Aniversario.',
      );
      expect(cuerpo).toContain('https://fedal.cl/torneos');
      expect(cuerpo).toContain(firmaDelClub(CLUB));
    });

    it('**en lista de espera, lo dice**: no "quedaste inscrito"', () => {
      const { cuerpo } = recibida({ estado: 'LISTA_ESPERA' });

      expect(cuerpo).toContain('lista de espera');
      expect(cuerpo).not.toContain('Quedaste inscrito');
    });

    it('**en lista de espera no se cobra, y se le avisa por correo si se abre un cupo** (T327)', () => {
      // Nace pendiente y sin medio, igual que la que anota el admin: sin esto le diría que
      // falta pagar en el club.
      const { cuerpo } = recibida({
        estado: 'LISTA_ESPERA',
        estadoPago: 'PENDIENTE',
        medioPago: null,
      });

      expect(cuerpo).toContain('No se cobra nada mientras esperas');
      expect(cuerpo).toContain('te avisamos por correo');
      expect(cuerpo).not.toContain('Falta pagar');
      expect(cuerpo).not.toContain('el club te llama');
    });

    it('con transferencia, dice que el club revisa el comprobante', () => {
      const { cuerpo } = recibida({
        estadoPago: 'PENDIENTE',
        medioPago: 'TRANSFERENCIA',
      });

      expect(cuerpo).toContain('El club está revisando tu comprobante');
    });

    it('la que anota el admin sin pagar dice cuánto falta y dónde se paga', () => {
      const { cuerpo } = recibida({ estadoPago: 'PENDIENTE', medioPago: null });

      expect(cuerpo).toContain('Falta pagar la inscripción ($15.000)');
    });

    it('**el pago aprobado confirma la inscripción**', () => {
      const { asunto, cuerpo } = pagoAprobado(
        { ...INSCRIPCION, estadoPago: 'PAGADA' },
        CLUB,
        'https://fedal.cl',
      );

      expect(asunto).toBe('Pago confirmado: Torneo Aniversario, 4ª');
      expect(cuerpo).toContain('confirmamos el pago de tu inscripción');
      expect(cuerpo).toContain(
        'Quedaste inscrito en 4ª de Torneo Aniversario.',
      );
    });

    it('**al que ya salió del cuadro no le dice "quedaste inscrito"**', () => {
      // El club puede confirmar el pago de alguien que retiró antes: el correo confirma
      // la plata, no un lugar que ya no tiene.
      const { cuerpo } = pagoAprobado(
        { ...INSCRIPCION, estado: 'RETIRADA', estadoPago: 'PAGADA' },
        CLUB,
        'https://fedal.cl',
      );

      expect(cuerpo).toContain('confirmamos el pago de tu inscripción');
      expect(cuerpo).not.toContain('Quedaste inscrito');
    });

    it('**el pago rechazado dice el motivo y que el cupo quedó libre**', () => {
      const { asunto, cuerpo } = pagoRechazado(
        {
          ...INSCRIPCION,
          estado: 'RETIRADA',
          estadoPago: 'RECHAZADA',
          motivoRechazo: 'La transferencia no llegó',
        },
        CLUB,
        'https://fedal.cl',
      );

      expect(asunto).toBe('Pago rechazado: Torneo Aniversario, 4ª');
      expect(cuerpo).toContain('Motivo: La transferencia no llegó');
      expect(cuerpo).toContain('tu lugar en el cuadro quedó libre');
    });
  });

  describe('la lista de espera (T329, SPEC-torneos.md § Lista de espera sin cobro)', () => {
    const EN_ESPERA: InscripcionParaAvisar = {
      nombre: 'Camila',
      torneo: 'Torneo Aniversario',
      categoria: '4ª',
      montoClp: 15_000,
      estado: 'LISTA_ESPERA',
      estadoPago: 'PENDIENTE',
      medioPago: null,
      motivoRechazo: null,
      token: 'llave-de-camila',
      // Viernes 16 de octubre de 2026 a las 10:30 en Santiago (UTC-3).
      cupoOfrecidoHasta: new Date('2026-10-16T13:30:00.000Z'),
    };

    const ofrecido = (parche: Partial<InscripcionParaAvisar> = {}) =>
      cupoOfrecido({ ...EN_ESPERA, ...parche }, CLUB, 'https://fedal.cl');

    it('**«Se abrió un cupo» dice el torneo y la categoría**, también en el asunto', () => {
      const { asunto, cuerpo } = ofrecido();

      expect(asunto).toBe('Se abrió un cupo: Torneo Aniversario, 4ª');
      expect(cuerpo).toContain('Hola Camila:');
      expect(cuerpo).toContain('4ª de Torneo Aniversario');
      expect(cuerpo).toContain(firmaDelClub(CLUB));
    });

    it('**lleva el enlace para tomarlo y hasta cuándo se le guarda**, en el reloj del club', () => {
      const { cuerpo } = ofrecido();

      expect(cuerpo).toContain(
        'https://fedal.cl/torneos/inscripcion/llave-de-camila',
      );
      expect(cuerpo).toContain('viernes, 16 de octubre, a las 10:30');
    });

    it('dice cuánto se paga, y que si no lo toma pasa al siguiente', () => {
      const { cuerpo } = ofrecido();

      expect(cuerpo).toContain('$15.000');
      expect(cuerpo).toContain('pasa al siguiente');
    });

    it('**en una categoría gratis no habla de pagar** (E5)', () => {
      const { cuerpo } = ofrecido({ montoClp: 0, estadoPago: 'EXENTA' });

      expect(cuerpo).not.toContain('$');
      expect(cuerpo).not.toContain('pag');
      expect(cuerpo).toContain(
        'https://fedal.cl/torneos/inscripcion/llave-de-camila',
      );
    });

    it('sin oferta no inventa un plazo', () => {
      expect(() => ofrecido({ cupoOfrecidoHasta: null })).toThrow(
        'cupo ofrecido',
      );
    });

    it('**«Se venció tu plazo» dice que el cupo pasó al siguiente, y cómo volver a la fila** (T335, E2)', () => {
      const { asunto, cuerpo } = ofertaVencida(
        { ...EN_ESPERA, estado: 'RETIRADA' },
        CLUB,
        'https://fedal.cl',
      );

      expect(asunto).toBe('Se venció tu plazo: Torneo Aniversario, 4ª');
      expect(cuerpo).toContain('pasó al siguiente de la lista de espera');
      expect(cuerpo).toContain('inscribirte de nuevo');
      expect(cuerpo).toContain(firmaDelClub(CLUB));
    });

    it('**«Quedaste dentro» al que ya había pagado** (E4)', () => {
      const { asunto, cuerpo } = quedasteDentro(
        {
          ...EN_ESPERA,
          estado: 'INSCRITA',
          estadoPago: 'PAGADA',
          cupoOfrecidoHasta: null,
        },
        CLUB,
        'https://fedal.cl',
      );

      expect(asunto).toBe('Quedaste dentro: Torneo Aniversario, 4ª');
      expect(cuerpo).toContain(
        'Quedaste inscrito en 4ª de Torneo Aniversario.',
      );
      expect(cuerpo).not.toContain('Falta pagar');
    });

    it('al que había subido su comprobante le dice que el club todavía lo revisa', () => {
      const { cuerpo } = quedasteDentro(
        {
          ...EN_ESPERA,
          estado: 'INSCRITA',
          medioPago: 'TRANSFERENCIA',
          cupoOfrecidoHasta: null,
        },
        CLUB,
        'https://fedal.cl',
      );

      expect(cuerpo).toContain('El club está revisando tu comprobante');
    });
  });

  describe('la programación de un partido (T133)', () => {
    const PARTIDO: PartidoParaAvisar = {
      nombre: 'Pedro',
      rival: 'Andrés Soto',
      torneo: 'Torneo Aniversario',
      categoria: '4ª',
      ronda: 'Semifinal',
    };

    // Sábado 4 de diciembre de 2027, de 10:00 a 11:30 en Santiago (UTC-3 en verano).
    const SABADO = {
      cancha: 'Cancha 1',
      inicio: new Date('2027-12-04T13:00:00.000Z'),
      fin: new Date('2027-12-04T14:30:00.000Z'),
    };
    const DOMINGO = {
      cancha: 'Cancha 2',
      inicio: new Date('2027-12-05T18:00:00.000Z'),
      fin: new Date('2027-12-05T19:30:00.000Z'),
    };

    it('**programado: contra quién, dónde y cuándo**, con el día y la hora en el asunto', () => {
      const { asunto, cuerpo } = partidoProgramado(
        PARTIDO,
        SABADO,
        CLUB,
        'https://fedal.cl',
      );

      expect(asunto).toBe('Tu partido: sábado, 4 de diciembre, a las 10:00');
      expect(cuerpo).toContain('Hola Pedro:');
      expect(cuerpo).toContain('Rival: Andrés Soto');
      expect(cuerpo).toContain('Ronda: Semifinal de 4ª');
      expect(cuerpo).toContain('Cancha: Cancha 1');
      expect(cuerpo).toContain('Hora: de 10:00 a 11:30');
      expect(cuerpo).toContain('https://fedal.cl/torneos');
      expect(cuerpo).toContain(firmaDelClub(CLUB));
    });

    it('**cambiado: lo de antes y lo de ahora**', () => {
      const { asunto, cuerpo } = partidoCambiado(
        PARTIDO,
        SABADO,
        DOMINGO,
        CLUB,
        'https://fedal.cl',
      );

      expect(asunto).toBe(
        'Tu partido cambió: domingo, 5 de diciembre, a las 15:00',
      );
      expect(cuerpo).toContain(
        'Antes: Cancha 1, sábado, 4 de diciembre, de 10:00 a 11:30',
      );
      expect(cuerpo).toContain(
        'Ahora: Cancha 2, domingo, 5 de diciembre, de 15:00 a 16:30',
      );
    });

    it('**sin hora: cuál era, y que el club avisa cuando lo vuelva a programar**', () => {
      const { asunto, cuerpo } = partidoSinHora(
        PARTIDO,
        SABADO,
        CLUB,
        'https://fedal.cl',
      );

      expect(asunto).toBe('Tu partido quedó sin hora');
      expect(cuerpo).toContain(
        'Cancha 1, sábado, 4 de diciembre, de 10:00 a 11:30',
      );
      expect(cuerpo).toContain('Te avisamos cuando lo volvamos a programar');
    });
  });

  describe('el cuadro armado (T132)', () => {
    const CUADRO = {
      nombre: 'Pedro',
      torneo: 'Torneo Aniversario',
      categoria: '4ª',
      cuadroId: 42,
    };

    const armado = (
      primero: Parameters<typeof cuadroArmado>[1],
      rehecho = false,
    ) => cuadroArmado(CUADRO, primero, rehecho, CLUB, 'https://fedal.cl');

    it('**dice contra quién es su primer partido**, y enlaza al cuadro', () => {
      const { asunto, cuerpo } = armado({
        ronda: 'Cuartos de final',
        rival: 'Andrés Soto',
        hora: null,
      });

      expect(asunto).toBe('Cuadro armado: Torneo Aniversario, 4ª');
      expect(cuerpo).toContain('Hola Pedro:');
      expect(cuerpo).toContain(
        'Tu primer partido: Cuartos de final, contra Andrés Soto.',
      );
      expect(cuerpo).toContain('te avisamos cuando el club lo programe');
      expect(cuerpo).toContain('https://fedal.cl/torneos?cuadro=42');
      expect(cuerpo).toContain(firmaDelClub(CLUB));
    });

    it('**con un bye, dice que pasa directo**', () => {
      const { cuerpo } = armado({
        ronda: 'Cuartos de final',
        rival: null,
        hora: null,
        siguiente: 'Semifinal',
      });

      expect(cuerpo).toContain(
        'En Cuartos de final no juegas (bye): pasas directo a Semifinal.',
      );
    });

    it('si el partido ya tiene hora, la dice', () => {
      const { cuerpo } = armado({
        ronda: 'Final',
        rival: 'Andrés Soto',
        hora: {
          cancha: 'Cancha 1',
          inicio: new Date('2027-12-04T13:00:00.000Z'),
          fin: new Date('2027-12-04T14:30:00.000Z'),
        },
      });

      expect(cuerpo).toContain(
        'Cancha 1, sábado, 4 de diciembre, de 10:00 a 11:30',
      );
    });

    it('**rearmado: el asunto y el texto dicen que el cuadro cambió**', () => {
      const { asunto, cuerpo } = armado(
        { ronda: 'Cuartos de final', rival: 'Andrés Soto', hora: null },
        true,
      );

      expect(asunto).toBe('El cuadro cambió: Torneo Aniversario, 4ª');
      expect(cuerpo).toContain('El club rehízo el cuadro');
    });
  });
});
