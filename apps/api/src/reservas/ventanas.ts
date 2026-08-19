/** Las dos ventanas del club, tal como salen de `ConfiguracionClub`. */
export interface VentanasDelClub {
  horasMinModificacion: number;
  horasReembolsoTotal: number;
}

const EN_MILISEGUNDOS = 60 * 60 * 1000;

/**
 * Si todavía se puede mover la reserva.
 *
 * Se mide contra el inicio **actual** de la reserva: es la hora que el club tiene
 * comprometida y la que hay que liberar con tiempo para que otro la tome.
 *
 * El borde cuenta a favor de quien reserva —a las 6 horas exactas todavía se puede—,
 * igual que `alDiaHasta` en identidad y los 15 minutos de la expiración.
 */
export function sePuedeModificar(
  inicio: Date,
  ahora: Date,
  ventanas: VentanasDelClub,
): boolean {
  return horasHasta(inicio, ahora) >= ventanas.horasMinModificacion;
}

/**
 * Si corresponde devolver el 100%.
 *
 * **Se mide contra el bloque que se compró, no contra el reagendado**
 * (`SPEC-pagos.md` § Reembolso). Sin esa regla hay un agujero que se paga en plata:
 * quien quiere cancelar faltando 12 horas mueve la reserva a la semana siguiente
 * —puede, hasta 6 horas antes— y cancela con 24 de sobra. Por eso `Transaccion`
 * conserva `inicioBloqueOriginal`, y por eso este parámetro es ese instante y no el
 * de la reserva.
 */
export function correspondeReembolso(
  inicioBloqueOriginal: Date,
  ahora: Date,
  ventanas: VentanasDelClub,
): boolean {
  return (
    horasHasta(inicioBloqueOriginal, ahora) >= ventanas.horasReembolsoTotal
  );
}

function horasHasta(instante: Date, ahora: Date): number {
  return (instante.getTime() - ahora.getTime()) / EN_MILISEGUNDOS;
}
