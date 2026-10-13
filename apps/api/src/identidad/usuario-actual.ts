import { EstadoSocio } from '../generated/prisma/client';

/**
 * Lo único que `identidad` expone hacia los demás módulos. Ninguno lee sus tablas;
 * todos preguntan por acá. Ver SPEC-identidad.md § Contrato hacia los demás módulos.
 */
export interface UsuarioActual {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  /** Nulo para quien entró con Google: Google no entrega el teléfono. */
  telefono: string | null;
  esAdmin: boolean;
  /** Ve la agenda del día y anota observaciones (T215). */
  esGestor: boolean;
  socioId: number | null;
  /** El socio está en estado ACTIVO. */
  socioActivo: boolean;
  /** Tiene la cuota pagada: `alDiaHasta` es hoy o después. */
  socioAlDia: boolean;
  /** Nulo si no tiene ficha o si la ficha está inactiva: un profesor de baja no da clases. */
  profesorId: number | null;
}

/** Lo mínimo que hay que traer de la base para armar el contrato. */
export interface UsuarioConFichas {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  esAdmin: boolean;
  esGestor: boolean;
  socio: { id: number; estado: EstadoSocio; alDiaHasta: Date } | null;
  profesor: { id: number; activo: boolean } | null;
}

/**
 * **La regla de "al día", una sola**: la usan la sesión y la reserva que toma el mesón,
 * así que un socio no puede estar al día cuando reserva él y moroso cuando lo atiende el
 * club. El día que vence todavía cuenta: quien pagó hasta hoy juega hoy.
 *
 * @param hoy El día del club como medianoche UTC (`hoyEnElClub`), la misma forma en que
 *            vuelve la columna `DATE`. Pasarle un instante corre el vencimiento un día.
 */
export function estaAlDia(
  alDiaHasta: Date | null | undefined,
  hoy: Date,
): boolean {
  return (alDiaHasta?.getTime() ?? -Infinity) >= hoy.getTime();
}

/**
 * `socioActivo` y `socioAlDia` se calculan por separado a propósito: un socio
 * suspendido no es lo mismo que uno atrasado en la cuota, y `reservas` tiene que
 * poder decirle a cada uno qué le pasa. Un `puedeReservar` ahorra un campo y
 * arruina los dos mensajes.
 */
export function usuarioActualDe(
  usuario: UsuarioConFichas,
  hoy: Date,
): UsuarioActual {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    email: usuario.email,
    telefono: usuario.telefono,
    esAdmin: usuario.esAdmin,
    esGestor: usuario.esGestor,
    socioId: usuario.socio?.id ?? null,
    socioActivo: usuario.socio?.estado === EstadoSocio.ACTIVO,
    socioAlDia: estaAlDia(usuario.socio?.alDiaHasta, hoy),
    profesorId: usuario.profesor?.activo ? usuario.profesor.id : null,
  };
}
