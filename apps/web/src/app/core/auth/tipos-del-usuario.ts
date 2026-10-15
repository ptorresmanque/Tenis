import type { UsuarioActual } from './auth';

/**
 * Lo que la cuenta es en el club, para mostrarlo junto al avatar (T276, SPEC-revision-qa.md
 * A6): todos sus tipos, en el orden del club, o «Invitado» si no tiene ninguno. Socio y
 * profesor lo son por su ficha; la de profesor solo llega si está activa.
 */
export function tiposDelUsuario(usuario: UsuarioActual): string[] {
  const tipos = [
    usuario.esAdmin && 'Administrador',
    usuario.socioId !== null && 'Socio',
    usuario.esGestor && 'Gestor',
    usuario.profesorId !== null && 'Profesor',
  ].filter((tipo) => tipo !== false);

  return tipos.length > 0 ? tipos : ['Invitado'];
}
