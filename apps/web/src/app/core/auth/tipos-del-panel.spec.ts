import { describe, expect, it } from 'vitest';

import type { UsuarioActual } from './auth';
import { inicioDelPanel, puedeVer } from './tipos-del-panel';

/**
 * T220. Qué rutas del panel ve cada tipo (`SPEC-identidad.md` § Tipos de usuario). Lo
 * leen el guard y el menú, así que no pueden contradecirse: un ítem nunca aparece para
 * quien su ruta rechaza. Lo que no está en el mapa es solo del admin.
 */
describe('tipos del panel', () => {
  const NADIE: UsuarioActual = {
    id: 1,
    nombre: 'Ana',
    apellido: 'Rojas',
    email: 'ana@ejemplo.cl',
    telefono: null,
    esAdmin: false,
    esGestor: false,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };
  const ADMIN = { ...NADIE, esAdmin: true };
  const GESTOR = { ...NADIE, esGestor: true };
  const PROFESOR = { ...NADIE, profesorId: 7 };
  const LOS_DOS = { ...NADIE, esGestor: true, profesorId: 7 };
  const SOCIO = { ...NADIE, socioId: 3, socioActivo: true, socioAlDia: true };

  describe('puedeVer', () => {
    it('el admin ve todo, también lo que no está en el mapa', () => {
      expect(puedeVer('/administracion/canchas', ADMIN)).toBe(true);
      expect(puedeVer('/administracion/configuracion/reglas', ADMIN)).toBe(true);
      expect(puedeVer('/estado', ADMIN)).toBe(true);
    });

    it('el gestor ve la agenda del día, también con la fecha en la URL', () => {
      expect(puedeVer('/administracion/reservas', GESTOR)).toBe(true);
      expect(puedeVer('/administracion/reservas?fecha=2026-10-14', GESTOR)).toBe(
        true,
      );
    });

    it('**el gestor ve la agenda, pero no su pestaña de ocupación** (T285, A3)', () => {
      // Comparten la ruta madre: sin la regla, el recorte a tres tramos se la abría.
      expect(puedeVer('/administracion/reservas/ocupacion', GESTOR)).toBe(false);
      expect(puedeVer('/administracion/reservas/ocupacion', ADMIN)).toBe(true);
      expect(puedeVer('/administracion/reservas', GESTOR)).toBe(true);
    });

    it('el gestor no ve nada más', () => {
      expect(puedeVer('/administracion/canchas', GESTOR)).toBe(false);
      expect(puedeVer('/administracion/clases', GESTOR)).toBe(false);
      expect(puedeVer('/administracion/configuracion/reglas', GESTOR)).toBe(false);
      expect(puedeVer('/estado', GESTOR)).toBe(false);
    });

    it('el profesor ve Clases y nada más', () => {
      expect(puedeVer('/administracion/clases', PROFESOR)).toBe(true);
      expect(puedeVer('/administracion/reservas', PROFESOR)).toBe(false);
      expect(puedeVer('/administracion/profesores', PROFESOR)).toBe(false);
    });

    it('quien tiene los dos tipos ve los dos', () => {
      expect(puedeVer('/administracion/reservas', LOS_DOS)).toBe(true);
      expect(puedeVer('/administracion/clases', LOS_DOS)).toBe(true);
      expect(puedeVer('/administracion/socios', LOS_DOS)).toBe(false);
    });

    it('una ruta nueva que no está en el mapa nace cerrada para todos menos el admin', () => {
      expect(puedeVer('/administracion/una-pantalla-nueva', LOS_DOS)).toBe(false);
    });

    it('el socio y quien no entró no ven nada', () => {
      expect(puedeVer('/administracion/reservas', SOCIO)).toBe(false);
      expect(puedeVer('/administracion/reservas', null)).toBe(false);
    });
  });

  describe('inicioDelPanel', () => {
    it('es la primera ruta del panel que puede ver', () => {
      expect(inicioDelPanel(ADMIN)).toBe('/administracion/reservas');
      expect(inicioDelPanel(GESTOR)).toBe('/administracion/reservas');
      expect(inicioDelPanel(PROFESOR)).toBe('/administracion/clases');
      expect(inicioDelPanel(LOS_DOS)).toBe('/administracion/reservas');
    });

    it('quien no tiene panel no tiene inicio', () => {
      expect(inicioDelPanel(SOCIO)).toBeNull();
      expect(inicioDelPanel(null)).toBeNull();
    });
  });
});
