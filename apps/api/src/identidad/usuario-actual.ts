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

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * El último día en que el socio con la mensualidad vencida todavía reserva (T379,
 * SPEC-cuotas.md § Días de gracia). Junto a `estaAlDia` por lo mismo que ella: la usan la
 * sesión, las reservas y el mesón, y un socio no puede estar en gracia para el aviso y sin
 * gracia para la reserva.
 *
 * Fecha civil, como `alDiaHasta`. Sumar días en milisegundos es exacto porque va a
 * medianoche UTC, que no tiene cambio de hora.
 */
export function finDeLaGracia(alDiaHasta: Date, diasGracia: number): Date {
  return new Date(alDiaHasta.getTime() + diasGracia * UN_DIA_MS);
}

/**
 * Cuántos días de gracia le quedan, contando hoy: con 5 de gracia, 5 el primer día de la
 * deuda y 1 el último. `null` si está al día o si la gracia ya pasó, los dos casos en que no
 * hay nada que avisarle.
 *
 * @param hoy Como en `estaAlDia`: el día del club a medianoche UTC.
 */
export function diasDeGraciaRestantes(
  alDiaHasta: Date | null | undefined,
  hoy: Date,
  diasGracia: number,
): number | null {
  if (!alDiaHasta || estaAlDia(alDiaHasta, hoy)) return null;

  const restantes =
    (finDeLaGracia(alDiaHasta, diasGracia).getTime() - hoy.getTime()) /
      UN_DIA_MS +
    1;

  return restantes > 0 ? restantes : null;
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
