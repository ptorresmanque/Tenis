import { DatosDelClub, firmaDelClub } from '../comun/club';
import {
  avisoDeComprobante,
  InscripcionParaAvisar,
  inscripcionRecibida,
  pagoAprobado,
  pagoRechazado,
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
});
