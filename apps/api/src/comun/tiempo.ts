/**
 * La zona del club. Constante y no columna de `ConfiguracionClub`: el club es uno
 * solo y está en Santiago. Cuando haya un segundo club, será una columna.
 *
 * Zona IANA y nunca un desfase fijo: Chile cambia la hora dos veces al año y un
 * `-04:00` escrito a mano deja la grilla corrida medio año.
 */
export const ZONA_DEL_CLUB = 'America/Santiago';

/**
 * El día de hoy en el club, como medianoche UTC — la misma forma en que las
 * columnas `DATE` vuelven de la base, así que se pueden comparar directamente.
 *
 * Importa de verdad: a las 21:00 de un 17 de agosto en Santiago ya es 18 de
 * agosto en UTC. Usar la fecha UTC dejaría morosos a los socios diez horas antes
 * de tiempo, todas las noches.
 */
export function hoyEnElClub(ahora = new Date()): Date {
  // 'en-CA' da exactamente AAAA-MM-DD, que es lo que se necesita para rearmarla.
  const civil = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_DEL_CLUB,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);

  return new Date(`${civil}T00:00:00.000Z`);
}

const RELOJ = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_DEL_CLUB,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Qué marca el reloj del club en un instante dado, expresado como si esa lectura
 * fuera UTC. Restarlo del instante da el desfase vigente en ese momento — el que
 * corresponda, no uno fijo.
 */
function lecturaDelReloj(instante: Date): number {
  const p = RELOJ.formatToParts(instante).reduce<Record<string, string>>(
    (acumulado, parte) => {
      acumulado[parte.type] = parte.value;
      return acumulado;
    },
    {},
  );

  return Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
  );
}

/** "HH:MM" en 00:00–24:00. Las 24:00 son la medianoche del día siguiente. */
const HORA_VALIDA = /^([01]\d|2[0-4]):([0-5]\d)$/;

/**
 * Una hora del reloj del club, "HH:MM", en minutos desde la medianoche.
 *
 * Valida acá y no en cada quien la use: viene de una columna de texto que escribe
 * el panel, y un `NaN` que se propaga sin ruido se ve como un club que no abre.
 */
export function minutosDeReloj(hora: string): number {
  const partes = HORA_VALIDA.exec(hora);
  if (!partes) {
    throw new Error(`Hora del club ilegible: "${hora}". Se espera HH:MM.`);
  }

  const [, hh, mm] = partes;
  if (hh === '24' && mm !== '00') {
    throw new Error(
      `Hora del club ilegible: "${hora}". Después de 24:00 no hay.`,
    );
  }

  return Number(hh) * 60 + Number(mm);
}

/** El inverso de `minutosDeReloj`. 1440 minutos son las "24:00". */
export function horaDeReloj(minutos: number): string {
  const hh = String(Math.floor(minutos / 60)).padStart(2, '0');
  const mm = String(minutos % 60).padStart(2, '0');

  return `${hh}:${mm}`;
}

const FECHA_VALIDA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Una fecha civil "AAAA-MM-DD" como medianoche UTC — la misma forma en que vuelven
 * las columnas `DATE`, así que se compara con ellas directamente.
 *
 * No alcanza con que `Date` la acepte: `new Date('2026-02-30T00:00:00Z')` no es
 * inválida, se desborda en silencio al 2 de marzo. En T12 la fecha llega por query
 * string, así que alguien pediría la disponibilidad del 30 de febrero y recibiría
 * la del 2 de marzo sin que nada avise.
 */
export function fechaDelClub(fecha: string): Date {
  const dia = fechaCivil(fecha);
  if (!dia) {
    throw new Error(
      `Fecha del club ilegible: "${fecha}". Se espera AAAA-MM-DD.`,
    );
  }

  return dia;
}

function fechaCivil(fecha: string): Date | null {
  const partes = FECHA_VALIDA.exec(fecha);
  if (!partes) {
    return null;
  }

  const [, año, mes, dia] = partes;
  const instante = new Date(`${fecha}T00:00:00.000Z`);

  const seConserva =
    instante.getUTCFullYear() === Number(año) &&
    instante.getUTCMonth() === Number(mes) - 1 &&
    instante.getUTCDate() === Number(dia);

  return seConserva ? instante : null;
}

/**
 * El instante en que el reloj del club marca `hora` del día `fecha`.
 *
 * Es el camino inverso de `hoyEnElClub` y el que sostiene toda la grilla: el admin
 * configura "abre a las 08:00" y eso hay que volverlo un momento en el tiempo. En
 * agosto esas 08:00 son las 12:00Z y en enero las 11:00Z.
 *
 * @param fecha Fecha civil del club, "AAAA-MM-DD".
 * @param hora  Hora del reloj del club, "HH:MM". "24:00" es medianoche del día
 *              siguiente, para el club que cierra a las doce.
 */
export function instanteEnElClub(fecha: string, hora: string): Date {
  const minutos = minutosDeReloj(hora);
  const dia = fechaDelClub(fecha);

  // La lectura de reloj buscada, en la misma escala que `lecturaDelReloj`.
  const buscada = dia.getTime() + minutos * 60_000;

  // Dos pasadas: la primera estima con el desfase del instante equivocado y la
  // segunda corrige con el del instante estimado. Con eso basta salvo en los dos
  // domingos del año, y para esos está el filtro de abajo.
  const primera = buscada - (lecturaDelReloj(new Date(buscada)) - buscada);
  const segunda = buscada - (lecturaDelReloj(new Date(primera)) - primera);

  // Un candidato sirve solo si el reloj marca en él exactamente lo que se pidió.
  // El domingo que atrasa, la medianoche parece ocurrir dos veces y una de las dos
  // es mentira: a esa hora el reloj todavía marca las 23:00 del día anterior.
  const validos = [primera, segunda].filter(
    (t) => lecturaDelReloj(new Date(t)) === buscada,
  );

  // Entre dos vueltas válidas del reloj, la primera. Si ninguna lo es, la hora no
  // existe —el domingo que adelanta se salta una— y se corre lo que saltó el reloj.
  return new Date(
    validos.length > 0 ? Math.min(...validos) : Math.max(primera, segunda),
  );
}
