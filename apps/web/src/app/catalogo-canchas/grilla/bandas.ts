import { BloqueDisponible, Cancha, GrillaDeCancha } from '../disponibilidad';
import { enPesos } from '../reloj-del-club';

/**
 * Lo que el bloque dice de la tarifa del socio: nada de plata, porque no paga la
 * hora sino su cuota mensual.
 *
 * En un solo lugar porque aparece en el bloque, en la etiqueta accesible y en la
 * barra de abajo: el día que el club cobre la hora pico al socio, un "sin costo"
 * suelto habría quedado en dos de los tres y nadie lo notaría hasta que reclamen.
 *
 * No viene del servidor a propósito. `BloqueDisponible.montoClp` es la tarifa del
 * no-socio, y el contrato de `catalogo-canchas` no tiene ni tiene por qué tener un
 * precio por tipo de persona.
 */
export const TARIFA_DEL_SOCIO = 'sin costo';

/** Un inicio de la grilla —08:00–09:00, 08:30–09:30…—, con lo que pasa en cada cancha. */
export interface Franja {
  inicio: string;
  fin: string;
  libres: { cancha: Cancha; bloque: BloqueDisponible }[];
  /**
   * Las horas tomadas del propio socio que ya pasaron y sobre las que
   * puede reportar que nadie las usó (T35).
   *
   * Van aparte de la cuenta de ocupadas porque son las únicas ocupadas
   * que necesitan seguir siendo un elemento con un botón: agrupar por hora
   * convirtió el resto en un número, y con ellas eso habría borrado la
   * función sin que nadie lo notara hasta que el club preguntara por qué
   * dejaron de llegar reportes.
   */
  reportables: { cancha: Cancha; bloque: BloqueDisponible }[];
  ocupadas: number;
  /** Cerradas por mantención o por un motivo que no es clase ni torneo. */
  enMantencion: number;
  /**
   * Cerradas por una clase o un partido de torneo (T97). Aparte de la mantención: a
   * quien llega nuevo, "en clase" le dice que a esa hora hay algo que le puede servir.
   */
  enClase: number;
  enTorneo: number;
  /**
   * Libres que a quien no es socio no se le venden: 1 hora y media en una franja sin ese
   * precio (T79). Se cuentan para decirlo, en vez de que la fila diga "sin canchas libres".
   */
  soloSocios: number;
  esPico: boolean;
  /** Sin libres por haber pasado, que no es lo mismo que un club lleno. */
  yaPaso: boolean;
}

/**
 * Si la hora ya empezó, según el reloj de quien mira.
 *
 * La API rechaza reservar una hora que ya empezó (`BLOQUE_EN_EL_PASADO`), y la
 * grilla no ofrece lo que la API va a rechazar: a las 16:40 ofrecía la de las
 * 08:00. El filtro va acá y no en la disponibilidad pública porque el mesón lee el
 * mismo endpoint y sí puede tomar la hora que está corriendo. Si el reloj del
 * navegador anda mal, manda la API.
 */
export function yaEmpezo(bloque: BloqueDisponible): boolean {
  return new Date(bloque.inicio).getTime() <= Date.now();
}

/**
 * El día entero, agrupado por inicio y no por cancha.
 *
 * **Es el cambio de eje que decidió el club el 2026-09-08**, y la razón está en la
 * pregunta que trae el socio: *cuándo* puedo jugar. Agrupada por cancha, esa pregunta se
 * responde recorriendo ocho listas y comparándolas de memoria; agrupada por hora se
 * responde de un vistazo.
 *
 * Lo que arregla de paso: con ocho canchas y catorce bloques, la pantalla eran 112
 * tarjetas, que a dos columnas dan 56 filas y **10.223px de alto en un teléfono**.
 *
 * Desde T78 se reserva cada media hora, así que esto da un elemento por **inicio** —27 en
 * un día de 08:00 a 22:00—, y desde T103 cada uno es una fila de la tabla (`tablaDelDia`).
 *
 * Las canchas que no se pueden tomar no desaparecen: se cuentan. Saber que a las 19:00 hay
 * seis ocupadas y ninguna libre es información, y borrarla haría que esa hora se viera
 * igual que una que el club no abre.
 *
 * Lo que depende de quién mira —si una hora tomada es suya y reportable, si a quien no es
 * socio no se le vende— lo pregunta la grilla, que sabe quién es.
 */
export function agruparPorInicio(
  grillas: Pick<GrillaDeCancha, 'cancha' | 'bloques'>[],
  quienMira: {
    reportable: (bloque: BloqueDisponible) => boolean;
    noSeLeVende: (bloque: BloqueDisponible) => boolean;
  },
): Franja[] {
  const inicios = new Map<string, Franja>();

  for (const { cancha, bloques } of grillas) {
    for (const bloque of bloques) {
      const franja = inicios.get(bloque.inicio) ?? {
        inicio: bloque.inicio,
        fin: bloque.fin,
        libres: [],
        reportables: [],
        ocupadas: 0,
        enMantencion: 0,
        enClase: 0,
        enTorneo: 0,
        soloSocios: 0,
        esPico: bloque.esPico,
        yaPaso: yaEmpezo(bloque),
      };

      if (bloque.bloqueado) {
        if (bloque.motivoBloqueo === 'CLASE') franja.enClase++;
        else if (bloque.motivoBloqueo === 'TORNEO') franja.enTorneo++;
        else franja.enMantencion++;
      } else if (bloque.reservado) {
        franja.ocupadas++;
        if (quienMira.reportable(bloque)) franja.reportables.push({ cancha, bloque });
      } else if (!yaEmpezo(bloque)) {
        if (quienMira.noSeLeVende(bloque)) franja.soloSocios++;
        else franja.libres.push({ cancha, bloque });
      }

      inicios.set(bloque.inicio, franja);
    }
  }

  return [...inicios.values()].sort((una, otra) => una.inicio.localeCompare(otra.inicio));
}

/**
 * Lo que cuesta arrendar en esa hora, en las canchas de una celda de la tabla.
 *
 * Casi siempre es un solo monto para todas. Cuando el club cobra distinto por
 * cancha, la celda dice "desde" y el monto exacto lo dice la barra de abajo, con
 * la cancha que quedó marcada.
 */
export function precioDeLaHora(libres: { bloque: BloqueDisponible }[]): string | null {
  const montos = [
    ...new Set(
      libres.map(({ bloque }) => bloque.montoClp).filter((monto) => monto !== null),
    ),
  ];

  // Ninguna con precio: es la hora y media que solo ve el socio, y no hay arriendo.
  if (montos.length === 0) return null;

  return montos.length === 1
    ? enPesos(montos[0])
    : `desde ${enPesos(Math.min(...montos))}`;
}

