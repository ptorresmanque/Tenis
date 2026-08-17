import { fechaDelClub, instanteEnElClub } from '../comun/tiempo';

/** Una fila de `franja_horaria`, tal como vuelve de la base. */
export interface FranjaCandidata {
  id: number;
  /** Nulo = toda cancha. */
  canchaId: number | null;
  /** Nulo = todo día. 0 = domingo .. 6 = sábado. */
  diaSemana: number | null;
  /** Hora local del club, "HH:MM". */
  horaDesde: string;
  horaHasta: string;
  esPico: boolean;
  montoClp: number;
  /** Fechas civiles, como vuelven de las columnas `DATE`. */
  vigenteDesde: Date;
  vigenteHasta: Date | null;
}

/** Lo que un bloque cuesta y si limita el cupo del socio. Siempre juntos. */
export interface Tarifa {
  montoClp: number;
  esPico: boolean;
}

export interface BloqueATarifar {
  /** Fecha civil del club, "AAAA-MM-DD". */
  fecha: string;
  canchaId: number;
  /** Instante en que empieza el bloque. */
  inicio: Date;
  franjas: FranjaCandidata[];
}

/** Sin franja que lo cubra: gratis y fuera del cupo pico. */
const SIN_FRANJA: Tarifa = { montoClp: 0, esPico: false };

/**
 * Cuánto pesa una franja al competir por un bloque.
 *
 * La cancha pesa más que el día. No está en la spec y hay que decidirlo: "esta
 * cancha cuesta más" es una regla del club más fuerte que "los lunes cuestan más",
 * y sin un orden fijo el precio de un lunes en la cancha techada dependería del
 * orden en que la base devuelva las filas.
 */
function especificidad(franja: FranjaCandidata): number {
  return (
    (franja.canchaId !== null ? 2 : 0) + (franja.diaSemana !== null ? 1 : 0)
  );
}

/**
 * El precio y la condición de pico de un bloque, según la franja que lo cubre.
 *
 * **Los dos valores salen de la misma fila, nunca resueltos por separado.** Es la
 * razón de que `esPico` y `montoClp` vivan juntos en `FranjaHoraria`: si se
 * resolvieran aparte, un socio podría perder cupo pico en una hora que se le cobra
 * como valle, y ese desajuste no lo nota nadie hasta que reclama.
 *
 * La franja se elige por especificidad; si dos empatan, gana la que empezó a regir
 * después, y si también empatan, la creada después. El orden es total a propósito:
 * el precio de un bloque no puede depender de cómo venga ordenada la consulta.
 *
 * La franja se resuelve por el **inicio** del bloque. Un bloque que cruza el borde
 * entre valle y pico se cobra entero al precio de donde empieza; partirlo daría un
 * monto que no corresponde a ninguna tarifa publicada.
 */
export function franjaPara(bloque: BloqueATarifar): Tarifa {
  const dia = fechaDelClub(bloque.fecha);
  const diaSemana = dia.getUTCDay();

  const aplicables = bloque.franjas.filter((franja) => {
    if (franja.canchaId !== null && franja.canchaId !== bloque.canchaId) {
      return false;
    }

    if (franja.diaSemana !== null && franja.diaSemana !== diaSemana) {
      return false;
    }

    // El último día de vigencia cuenta entero, igual que `alDiaHasta` en
    // identidad: la fecha del papel es la última que vale.
    if (franja.vigenteDesde > dia) {
      return false;
    }

    if (franja.vigenteHasta !== null && franja.vigenteHasta < dia) {
      return false;
    }

    // Las horas de la franja son del reloj del club y el bloque llega en UTC:
    // hay que convertir, no comparar. En Chile, comparar sin convertir acierta
    // medio año y corre el horario pico una hora el otro medio.
    const desde = instanteEnElClub(bloque.fecha, franja.horaDesde);
    const hasta = instanteEnElClub(bloque.fecha, franja.horaHasta);

    // Cerrado abajo y abierto arriba, para que dos franjas contiguas no se pisen
    // en el minuto exacto en que una termina y la otra empieza.
    return bloque.inicio >= desde && bloque.inicio < hasta;
  });

  const ganadora = aplicables.reduce<FranjaCandidata | null>(
    (mejor, franja) =>
      mejor === null || leGana(franja, mejor) ? franja : mejor,
    null,
  );

  return ganadora
    ? { montoClp: ganadora.montoClp, esPico: ganadora.esPico }
    : SIN_FRANJA;
}

function leGana(franja: FranjaCandidata, otra: FranjaCandidata): boolean {
  const diferencia =
    especificidad(franja) - especificidad(otra) ||
    franja.vigenteDesde.getTime() - otra.vigenteDesde.getTime() ||
    franja.id - otra.id;

  return diferencia > 0;
}
