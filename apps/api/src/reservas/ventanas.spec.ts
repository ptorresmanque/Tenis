import { correspondeReembolso, sePuedeModificar } from './ventanas';

/**
 * T24. Las dos ventanas, y sobre todo cómo interactúan.
 *
 * Modificar es gratis hasta 6 horas antes, pero el reembolso exige 24. Sin cuidado,
 * eso es un agujero que se paga en plata: quien quiere cancelar faltando 12 horas
 * reagenda a la semana siguiente y cancela con 24 de sobra.
 */
describe('ventanas de modificación y reembolso', () => {
  const MANANA_20 = new Date('2026-08-18T00:00:00.000Z');
  const config = { horasMinModificacion: 6, horasReembolsoTotal: 24 };

  const horasAntes = (instante: Date, horas: number) =>
    new Date(instante.getTime() - horas * 60 * 60 * 1000);

  describe('modificar', () => {
    it('se puede con más de 6 horas por delante', () => {
      expect(
        sePuedeModificar(MANANA_20, horasAntes(MANANA_20, 7), config),
      ).toBe(true);
    });

    it('no se puede a menos de 6 horas', () => {
      expect(
        sePuedeModificar(MANANA_20, horasAntes(MANANA_20, 5), config),
      ).toBe(false);
    });

    it('justo a las 6 horas todavía se puede', () => {
      // El borde se cuenta a favor de quien reserva, igual que `alDiaHasta` y la
      // expiración de los 15 minutos: llegar en el minuto exacto no es llegar tarde.
      expect(
        sePuedeModificar(MANANA_20, horasAntes(MANANA_20, 6), config),
      ).toBe(true);
    });

    it('con la hora ya empezada, no', () => {
      expect(
        sePuedeModificar(
          MANANA_20,
          new Date(MANANA_20.getTime() + 60_000),
          config,
        ),
      ).toBe(false);
    });

    it('la ventana sale de la configuración', () => {
      // Con 12 horas de mínimo, lo que antes se podía deja de poderse, sin tocar
      // código.
      expect(
        sePuedeModificar(MANANA_20, horasAntes(MANANA_20, 7), {
          horasMinModificacion: 12,
          horasReembolsoTotal: 24,
        }),
      ).toBe(false);
    });
  });

  describe('reembolso', () => {
    it('corresponde con 25 horas de anticipación', () => {
      expect(
        correspondeReembolso(MANANA_20, horasAntes(MANANA_20, 25), config),
      ).toBe(true);
    });

    it('no corresponde con 23 horas', () => {
      expect(
        correspondeReembolso(MANANA_20, horasAntes(MANANA_20, 23), config),
      ).toBe(false);
    });

    it('justo a las 24 horas corresponde', () => {
      expect(
        correspondeReembolso(MANANA_20, horasAntes(MANANA_20, 24), config),
      ).toBe(true);
    });

    it('la ventana sale de la configuración', () => {
      expect(
        correspondeReembolso(MANANA_20, horasAntes(MANANA_20, 25), {
          horasMinModificacion: 6,
          horasReembolsoTotal: 48,
        }),
      ).toBe(false);
    });
  });

  describe('el agujero que se paga en plata', () => {
    it('reagendar no reinicia el derecho a devolución', () => {
      // **El caso del criterio 10 de `SPEC-pagos.md`.** Reserva de mañana a las 20:00,
      // faltan 12 horas. Se reagenda a la semana siguiente —se puede, faltan más de
      // 6— y se cancela acto seguido. Contra el bloque nuevo faltarían 7 días; contra
      // el que se compró, 12 horas.
      const ahora = horasAntes(MANANA_20, 12);
      const bloqueOriginal = MANANA_20;
      const bloqueReagendado = new Date(
        MANANA_20.getTime() + 7 * 24 * 60 * 60 * 1000,
      );

      expect(sePuedeModificar(bloqueOriginal, ahora, config)).toBe(true);
      // Lo que decide es el original, no el nuevo.
      expect(correspondeReembolso(bloqueOriginal, ahora, config)).toBe(false);
      expect(correspondeReembolso(bloqueReagendado, ahora, config)).toBe(true);
    });
  });
});
