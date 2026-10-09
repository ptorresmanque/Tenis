import { DatosDelClub, firmaDelClub } from '../comun/club';
import { avisoDeComprobante } from './correos';

/**
 * T130. Lo que dice el aviso a los administradores cuando llega un comprobante. Cuándo
 * sale y a quién se prueba contra la base, en `torneos-aviso-comprobante.spec.ts`.
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
});
