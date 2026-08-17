import { horaDeReloj, instanteEnElClub, minutosDeReloj } from '../comun/tiempo';

/** Un rango en que la cancha no se puede usar. Instantes, ya en UTC. */
export interface RangoBloqueado {
  inicio: Date;
  fin: Date;
  motivo: string;
}

/** Un bloque de la grilla. Sin precio: eso lo resuelve `franjas` (T11). */
export interface Bloque {
  inicio: Date;
  fin: Date;
  bloqueado: boolean;
  motivoBloqueo: string | null;
}

export interface DiaDeCancha {
  /** Fecha civil del club, "AAAA-MM-DD". */
  fecha: string;
  /** Hora local del club, "HH:MM". */
  horaApertura: string;
  horaCierre: string;
  duracionBloqueMin: number;
  bloqueos?: RangoBloqueado[];
}

/**
 * Los bloques de un día en una cancha, a partir del horario de apertura y los
 * bloqueos. Pura: ni base de datos ni reloj del sistema.
 *
 * Los bloques **no se guardan** —ver `SPEC-catalogo-canchas.md` § Decisión—, así
 * que cambiar `duracionBloqueMin` cambia la grilla sin migrar un solo dato.
 *
 * La grilla avanza en el **reloj del club**, no sumando minutos al instante de
 * apertura: el admin promete "de 10 a 11" y eso es lo que el socio espera ver. La
 * noche en que Chile atrasa la hora, el bloque de 23:00 a 24:00 dura dos horas de
 * verdad, y así tiene que ser: el club cierra cuando el reloj marca las doce.
 */
export function calcularBloques(dia: DiaDeCancha): Bloque[] {
  if (dia.duracionBloqueMin <= 0) {
    // Un 0 en la configuración colgaría el proceso en un bucle infinito, y eso se
    // ve como una API que no responde y no como el error de datos que es.
    throw new Error(
      `La duración de bloque debe ser positiva, no ${dia.duracionBloqueMin}.`,
    );
  }

  const apertura = minutosDeReloj(dia.horaApertura);
  const cierre = minutosDeReloj(dia.horaCierre);

  if (cierre < apertura) {
    // Un horario al revés no es "cero bloques": es un dato malo. Cruzar la
    // medianoche no está soportado —para cerrar a las doce está "24:00"—, y
    // devolver una grilla vacía lo escondería hasta que alguien reclame.
    throw new Error(
      `El club no puede cerrar (${dia.horaCierre}) antes de abrir (${dia.horaApertura}).`,
    );
  }

  // Los bordes del reloj, convertidos una sola vez: el fin de un bloque es el
  // inicio del siguiente, y calcularlo dos veces es trabajo de más y una ocasión
  // para que dos números que tienen que ser iguales dejen de serlo.
  const bordes: Date[] = [];
  for (let m = apertura; m <= cierre; m += dia.duracionBloqueMin) {
    bordes.push(instanteEnElClub(dia.fecha, horaDeReloj(m)));
  }

  const bloqueos = dia.bloqueos ?? [];

  // Un borde de más que bloques: el último tramo, si no cabe entero antes del
  // cierre, se queda sin par y no se ofrece. Media hora de cancha no le sirve a
  // nadie.
  return bordes.slice(0, -1).map((inicio, i) => {
    const fin = bordes[i + 1];

    // Se superpone si empieza antes de que el otro termine y termina después de
    // que el otro empiece. Los bordes exactos no cuentan: un bloqueo que termina
    // a las 12:00 no toca el bloque que empieza a las 12:00.
    const choque = bloqueos.find((b) => b.inicio < fin && b.fin > inicio);

    return {
      inicio,
      fin,
      bloqueado: choque !== undefined,
      // Cualquier parte del bloque tomada lo inutiliza entero, así que basta el
      // motivo del primero que lo pise.
      motivoBloqueo: choque?.motivo ?? null,
    };
  });
}
