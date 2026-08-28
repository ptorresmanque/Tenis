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
  socioId: number | null;
  /** El socio está en estado ACTIVO. */
  socioActivo: boolean;
  /** Tiene la cuota pagada: `alDiaHasta` es hoy o después. */
  socioAlDia: boolean;
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
  socio: { id: number; estado: EstadoSocio; alDiaHasta: Date } | null;
  profesor: { id: number } | null;
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
    socioId: usuario.socio?.id ?? null,
    socioActivo: usuario.socio?.estado === EstadoSocio.ACTIVO,
    // El día que vence todavía cuenta: quien pagó hasta hoy juega hoy.
    socioAlDia:
      (usuario.socio?.alDiaHasta.getTime() ?? -Infinity) >= hoy.getTime(),
    profesorId: usuario.profesor?.id ?? null,
  };
}
