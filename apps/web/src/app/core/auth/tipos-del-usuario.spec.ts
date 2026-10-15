import { describe, expect, it } from 'vitest';

import type { UsuarioActual } from './auth';
import { tiposDelUsuario } from './tipos-del-usuario';

/** T276. Los tipos que se ven junto al avatar (SPEC-revision-qa.md, A6). */
describe('tiposDelUsuario', () => {
  const CUENTA: UsuarioActual = {
    id: 1,
    nombre: 'Rodrigo',
    apellido: 'Torres',
    email: 'rodrigo@clubdetenis.cl',
    telefono: null,
    esAdmin: false,
    esGestor: false,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };

  it('**una cuenta sin ningún tipo es «Invitado»**', () => {
    expect(tiposDelUsuario(CUENTA)).toEqual(['Invitado']);
  });

  it('**con varios, todos, en el orden del club**', () => {
    expect(
      tiposDelUsuario({ ...CUENTA, esAdmin: true, esGestor: true, socioId: 3, profesorId: 2 }),
    ).toEqual(['Administrador', 'Socio', 'Gestor', 'Profesor']);
  });

  it('el socio lo es por su ficha, y el profesor por la suya', () => {
    expect(tiposDelUsuario({ ...CUENTA, socioId: 3 })).toEqual(['Socio']);
    expect(tiposDelUsuario({ ...CUENTA, profesorId: 2 })).toEqual(['Profesor']);
    expect(tiposDelUsuario({ ...CUENTA, esGestor: true })).toEqual(['Gestor']);
  });
});
