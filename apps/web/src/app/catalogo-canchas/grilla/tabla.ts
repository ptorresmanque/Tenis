import { BloqueDisponible, Cancha, GrillaDeCancha } from '../disponibilidad';
import { agruparPorInicio, Franja, precioDeLaHora } from './bandas';

export type TipoDeCancha = 'abierta' | 'techada';

/** El orden de las columnas: las abiertas primero, que son la mayoría del club. */
const TIPOS: TipoDeCancha[] = ['abierta', 'techada'];

/** Por qué una celda no tiene canchas libres. Cada una se dice distinto en pantalla. */
export type SinLibres = 'llena' | 'ya-paso' | 'no-se-arrienda' | 'cerrada';

/** Un tipo de cancha a una hora de inicio. */
export interface Celda {
  tipo: TipoDeCancha;
  /** En el orden del club: la primera es la que la barra preelige (A8 del plan). */
  libres: { cancha: Cancha; bloque: BloqueDisponible }[];
  /** "$12.000", "desde $12.000" o nulo si no hay libres con precio. */
  precio: string | null;
  esPico: boolean;
  ocupadas: number;
  enClase: number;
  enTorneo: number;
  enMantencion: number;
  sinLibres: SinLibres | null;
}

/** Una hora de inicio, con una celda por columna. */
export interface FilaDeLaTabla {
  inicio: string;
  fin: string;
  /** Si todas sus celdas son pico, ninguna, o nulo si difieren y lo dice cada celda. */
  pico: boolean | null;
  yaPaso: boolean;
  celdas: Celda[];
  /** Las horas propias que ya pasaron, para reportar que nadie las usó (T35). */
  reportables: { cancha: Cancha; bloque: BloqueDisponible }[];
}

export interface TablaDelDia {
  /** Los tipos que el club tiene en la grilla: si todas son abiertas, una sola. */
  columnas: TipoDeCancha[];
  filas: FilaDeLaTabla[];
}

const tipoDe = (cancha: Cancha): TipoDeCancha => (cancha.techada ? 'techada' : 'abierta');

/**
 * El día como tabla: una fila por hora de inicio y una columna por tipo de cancha (T102).
 *
 * Es la opción C que eligió el club el 2026-10-08. La cuenta de cada celda es la misma
 * de las bandas —`agruparPorInicio`, llamado una vez por tipo—, así que lo que la grilla
 * ya sabía decir (libres, ocupadas, en clase, en mantención, lo que no se vende) no se
 * vuelve a escribir: cambia cómo se agrupa, no qué se cuenta.
 */
export function tablaDelDia(
  grillas: Pick<GrillaDeCancha, 'cancha' | 'bloques'>[],
  quienMira: Parameters<typeof agruparPorInicio>[1],
): TablaDelDia {
  const columnas = TIPOS.filter((tipo) => grillas.some((g) => tipoDe(g.cancha) === tipo));
  const porTipo = columnas.map((tipo) =>
    agruparPorInicio(
      grillas.filter((g) => tipoDe(g.cancha) === tipo),
      quienMira,
    ),
  );
  const inicios = [...new Set(porTipo.flat().map((franja) => franja.inicio))].sort();

  const filas = inicios.map((inicio): FilaDeLaTabla => {
    const franjas = porTipo.map((deUnTipo) => deUnTipo.find((f) => f.inicio === inicio));
    const presentes = franjas.filter((f): f is Franja => f !== undefined);
    const picos = new Set(presentes.map((f) => f.esPico));

    return {
      inicio,
      fin: presentes[0].fin,
      pico: picos.size === 1 ? [...picos][0] : null,
      yaPaso: presentes[0].yaPaso,
      celdas: columnas.map((tipo, i) => celdaDe(tipo, franjas[i])),
      reportables: presentes.flatMap((f) => f.reportables),
    };
  });

  return { columnas, filas };
}

function celdaDe(tipo: TipoDeCancha, franja: Franja | undefined): Celda {
  if (!franja) {
    // Ese tipo no abre a esta hora: las techadas pueden abrir antes que las abiertas.
    return {
      tipo,
      libres: [],
      precio: null,
      esPico: false,
      ocupadas: 0,
      enClase: 0,
      enTorneo: 0,
      enMantencion: 0,
      sinLibres: 'cerrada',
    };
  }

  return {
    tipo,
    libres: franja.libres,
    precio: precioDeLaHora(franja.libres),
    esPico: franja.esPico,
    ocupadas: franja.ocupadas,
    enClase: franja.enClase,
    enTorneo: franja.enTorneo,
    enMantencion: franja.enMantencion,
    sinLibres: porQueNoHay(franja),
  };
}

/** En este orden: lo que pasó primero explica más que lo que está tomado. */
function porQueNoHay(franja: Franja): SinLibres | null {
  if (franja.libres.length > 0) return null;
  if (franja.yaPaso) return 'ya-paso';
  if (franja.soloSocios > 0) return 'no-se-arrienda';
  if (franja.ocupadas + franja.enClase + franja.enTorneo > 0) return 'llena';
  return 'cerrada';
}
