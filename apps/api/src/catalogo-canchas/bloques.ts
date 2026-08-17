import { instanteEnElClub } from '../comun/tiempo';

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

/** "HH:MM" a minutos desde la medianoche del reloj. */
function enMinutos(hora: string): number {
  const [hh, mm] = hora.split(':');
  return Number(hh) * 60 + Number(mm);
}

/** El inverso, para volver a pedirle el instante al reloj del club. */
function enHora(minutos: number): string {
  const hh = Math.floor(minutos / 60);
  const mm = minutos % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
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

  const cierre = enMinutos(dia.horaCierre);
  const bloqueos = dia.bloqueos ?? [];
  const bloques: Bloque[] = [];

  for (
    let desde = enMinutos(dia.horaApertura);
    desde + dia.duracionBloqueMin <= cierre;
    desde += dia.duracionBloqueMin
  ) {
    // El bloque que no cabe entero antes del cierre no se ofrece: media hora de
    // cancha no se le puede vender a nadie.
    const inicio = instanteEnElClub(dia.fecha, enHora(desde));
    const fin = instanteEnElClub(
      dia.fecha,
      enHora(desde + dia.duracionBloqueMin),
    );

    // Se superpone si empieza antes de que el otro termine y termina después de
    // que el otro empiece. Los bordes exactos no cuentan: un bloqueo que termina
    // a las 12:00 no toca el bloque que empieza a las 12:00.
    const choque = bloqueos.find((b) => b.inicio < fin && b.fin > inicio);

    bloques.push({
      inicio,
      fin,
      bloqueado: choque !== undefined,
      // Cualquier parte del bloque tomada lo inutiliza entero, así que basta el
      // motivo del primero que lo pise.
      motivoBloqueo: choque?.motivo ?? null,
    });
  }

  return bloques;
}
