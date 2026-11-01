import { EstadoSocio } from '../generated/prisma/client';
import {
  diasDeGraciaRestantes,
  finDeLaGracia,
  usuarioActualDe,
  UsuarioConFichas,
} from './usuario-actual';

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
    esGestor: false,
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
        profesor: { id: 3, activo: true },
      }),
      HOY,
    );

    expect(actual.socioId).toBe(7);
    expect(actual.profesorId).toBe(3);
  });

  it('un profesor con la ficha inactiva no es profesor (T215)', () => {
    // Un profesor que el club dio de baja no da clases, así que deja de entrar a Clases
    // sin que nadie tenga que acordarse de desvincularlo.
    const actual = usuarioActualDe(
      usuario({ profesor: { id: 3, activo: false } }),
      HOY,
    );

    expect(actual.profesorId).toBeNull();
  });

  it('el gestor es un tipo aparte, combinable con los demás (T215)', () => {
    const actual = usuarioActualDe(
      usuario({
        esGestor: true,
        socio: socio(EstadoSocio.ACTIVO, '2026-12-31'),
      }),
      HOY,
    );

    expect(actual).toMatchObject({
      esGestor: true,
      esAdmin: false,
      socioId: 7,
    });
  });

  it('lleva solo lo que el contrato promete', () => {
    const actual = usuarioActualDe(usuario({ esAdmin: true }), HOY);

    // Nada de hashes ni de googleId: los otros módulos reciben esto tal cual y
    // cualquier campo de más termina en un log o en una respuesta HTTP.
    expect(Object.keys(actual).sort()).toEqual([
      'apellido',
      'email',
      'esAdmin',
      'esGestor',
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

/**
 * T379 (SPEC-cuotas.md § Días de gracia). Fechas civiles a medianoche UTC, como vuelve la
 * columna `DATE` y como entrega `hoyEnElClub`.
 */
describe('los días de gracia de la cuota', () => {
  const dia = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);

  describe('finDeLaGracia', () => {
    it('es el último día pagado más los días de gracia', () => {
      expect(finDeLaGracia(dia('2026-10-31'), 5)).toEqual(dia('2026-11-05'));
    });

    it('con 0 días es el mismo último día pagado', () => {
      expect(finDeLaGracia(dia('2026-10-31'), 0)).toEqual(dia('2026-10-31'));
    });

    it('cruza de diciembre a enero', () => {
      expect(finDeLaGracia(dia('2026-12-31'), 5)).toEqual(dia('2027-01-05'));
    });

    it('cruza de febrero a marzo, en un año normal y en uno bisiesto', () => {
      expect(finDeLaGracia(dia('2027-02-28'), 5)).toEqual(dia('2027-03-05'));
      expect(finDeLaGracia(dia('2028-02-29'), 5)).toEqual(dia('2028-03-05'));
    });
  });

  describe('diasDeGraciaRestantes', () => {
    it('al día no hay gracia que contar, tampoco el día en que vence', () => {
      expect(
        diasDeGraciaRestantes(dia('2026-10-31'), dia('2026-10-31'), 5),
      ).toBeNull();
      expect(
        diasDeGraciaRestantes(dia('2026-12-31'), dia('2026-10-31'), 5),
      ).toBeNull();
    });

    it('el primer día de la deuda le quedan todos, porque el de hoy cuenta', () => {
      expect(
        diasDeGraciaRestantes(dia('2026-10-31'), dia('2026-11-01'), 5),
      ).toBe(5);
    });

    it('el último día de gracia le queda 1', () => {
      expect(
        diasDeGraciaRestantes(dia('2026-10-31'), dia('2026-11-05'), 5),
      ).toBe(1);
    });

    it('el día siguiente al último ya no tiene gracia', () => {
      expect(
        diasDeGraciaRestantes(dia('2026-10-31'), dia('2026-11-06'), 5),
      ).toBeNull();
    });

    it('con 0 días de gracia, el primer día de la deuda no tiene gracia', () => {
      expect(
        diasDeGraciaRestantes(dia('2026-10-31'), dia('2026-11-01'), 0),
      ).toBeNull();
    });

    it('cuenta bien de diciembre a enero', () => {
      expect(
        diasDeGraciaRestantes(dia('2026-12-31'), dia('2027-01-03'), 5),
      ).toBe(3);
    });

    it('sin ficha de socio no hay gracia', () => {
      expect(diasDeGraciaRestantes(null, dia('2026-11-01'), 5)).toBeNull();
    });
  });
});
