import { EstadoSocio } from '../generated/prisma/client';
import { usuarioActualDe, UsuarioConFichas } from './usuario-actual';

/**
 * T8. Los dos casos cruzados —socio activo pero moroso, socio suspendido pero al
 * día— son los que producen el mensaje de error equivocado si alguien colapsa las
 * dos condiciones en un solo booleano.
 */
const HOY = new Date('2026-08-17T00:00:00.000Z');

function usuario(fichas: Partial<UsuarioConFichas> = {}): UsuarioConFichas {
  return {
    id: 1,
    nombre: 'Carolina',
    apellido: 'Rojas',
    email: 'carolina@ejemplo.cl',
    telefono: null,
    esAdmin: false,
    socio: null,
    profesor: null,
    ...fichas,
  };
}

function socio(
  estado: EstadoSocio,
  alDiaHasta: string,
): UsuarioConFichas['socio'] {
  return { id: 7, estado, alDiaHasta: new Date(`${alDiaHasta}T00:00:00.000Z`) };
}

describe('usuarioActualDe', () => {
  it('un visitante no tiene ficha de socio ni de profesor', () => {
    expect(usuarioActualDe(usuario(), HOY)).toMatchObject({
      socioId: null,
      socioActivo: false,
      socioAlDia: false,
      profesorId: null,
    });
  });

  it('un socio ACTIVO con la cuota vencida está activo y no al día', () => {
    const actual = usuarioActualDe(
      usuario({ socio: socio(EstadoSocio.ACTIVO, '2026-07-31') }),
      HOY,
    );

    // "Tienes la cuota vencida, págala y vuelve" no es "tu membresía está
    // suspendida, habla con administración". Por eso van separados.
    expect(actual.socioActivo).toBe(true);
    expect(actual.socioAlDia).toBe(false);
  });

  it('un socio SUSPENDIDO al día no está activo y sí al día', () => {
    const actual = usuarioActualDe(
      usuario({ socio: socio(EstadoSocio.SUSPENDIDO, '2026-12-31') }),
      HOY,
    );

    expect(actual.socioActivo).toBe(false);
    expect(actual.socioAlDia).toBe(true);
  });

  it('un socio RETIRADO no está activo', () => {
    const actual = usuarioActualDe(
      usuario({ socio: socio(EstadoSocio.RETIRADO, '2026-12-31') }),
      HOY,
    );

    expect(actual.socioActivo).toBe(false);
  });

  it('el día en que vence la cuota todavía cuenta como al día', () => {
    // El borde: con `>` en vez de `>=`, el socio queda moroso a las 00:00 del día
    // que pagó hasta, y se entera cuando le rechazan la reserva de esa tarde.
    const actual = usuarioActualDe(
      usuario({ socio: socio(EstadoSocio.ACTIVO, '2026-08-17') }),
      HOY,
    );

    expect(actual.socioAlDia).toBe(true);
  });

  it('un usuario puede ser socio y profesor a la vez', () => {
    const actual = usuarioActualDe(
      usuario({
        socio: socio(EstadoSocio.ACTIVO, '2026-12-31'),
        profesor: { id: 3 },
      }),
      HOY,
    );

    expect(actual.socioId).toBe(7);
    expect(actual.profesorId).toBe(3);
  });

  it('lleva solo lo que el contrato promete', () => {
    const actual = usuarioActualDe(usuario({ esAdmin: true }), HOY);

    // Nada de hashes ni de googleId: los otros módulos reciben esto tal cual y
    // cualquier campo de más termina en un log o en una respuesta HTTP.
    expect(Object.keys(actual).sort()).toEqual([
      'apellido',
      'email',
      'esAdmin',
      'id',
      'nombre',
      'profesorId',
      'socioActivo',
      'socioAlDia',
      'socioId',
      'telefono',
    ]);
  });
});
