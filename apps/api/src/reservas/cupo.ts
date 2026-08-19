import { EstadoSocio } from '../generated/prisma/client';
// `hoyEnElClub` con un instante devuelve su día civil en el club; se renombra porque
// acá no se usa para "hoy" sino para el día del bloque, que puede ser otro mes.
import { fechaDelClub, hoyEnElClub as diaDelClub } from '../comun/tiempo';
import { mesDelClub } from './invitados';

/** Un socio, mirado desde las reglas de reserva. */
export interface SocioQueReserva {
  id: number;
  estado: EstadoSocio;
  /** Fecha civil: hasta cuándo tiene la cuota pagada. */
  alDiaHasta: Date;
}

/** Quién más va a jugar. Socio del club o invitado externo, exactamente uno. */
export interface AcompananteDeclarado {
  socioId?: number | null;
  nombre?: string | null;
  /** Como lo escribe la persona. `ReservasService` lo traduce a `socioId`. */
  numeroSocio?: string | null;
}

/** Un socio ya comprometido en otra cancha, con lo necesario para explicarlo. */
export interface OcupacionDeSocio {
  socioId: number;
  nombre: string;
  cancha: string;
  inicio: Date;
  fin: Date;
}

export interface SolicitudDeSocio {
  socio: SocioQueReserva;
  bloque: { inicio: Date; fin: Date; esPico: boolean };
  /** Fecha civil del club, "AAAA-MM-DD". */
  hoyEnElClub: string;
  config: {
    cupoDiarioSocioHoras: number;
    cupoPicoSemanalHoras: number;
    invitadosPorMes: number;
  };
  /** Reservas activas que el socio ya tiene ese día. */
  reservasDelDia: number;
  /** Horas pico activas que ya tiene esta semana, lunes a domingo. */
  horasPicoDeLaSemana: number;
  /** Invitados externos que ya registró en el mes del bloque. */
  invitadosDelMes: number;
  acompanantes: AcompananteDeclarado[];
  /** Dónde están comprometidos el titular y los acompañantes a esa hora. */
  ocupados: OcupacionDeSocio[];
}

export type TipoDeRechazo =
  | 'MEMBRESIA_INACTIVA'
  | 'CUOTA_VENCIDA'
  | 'CUPO_DIARIO'
  | 'CUPO_PICO'
  | 'SIN_ACOMPANANTE'
  | 'ACOMPANANTE_ES_TITULAR'
  | 'YA_ESTA_EN_OTRA_CANCHA'
  | 'CUPO_INVITADOS';

export interface Rechazo {
  tipo: TipoDeRechazo;
  /** Listo para mostrar. Dice cuál es el límite y qué hacer con él. */
  mensaje: string;
}

/**
 * Si el socio puede reservar ese bloque, y si no, por qué.
 *
 * **El orden de los chequeos es el mensaje**, no un detalle de implementación: quien
 * está suspendido y además pasado de cupo tiene que leer que está suspendido, porque
 * es lo que puede resolver. Colapsarlos en un "no puedes reservar" manda al socio a
 * pagar una cuota que ya pagó, o a reclamar por una suspensión que no existe.
 *
 * Función pura: las consultas las hace `ReservasService`. Así las reglas —que son lo
 * que el club discute y cambia— se prueban sin base de datos.
 */
export function evaluarReservaDeSocio(
  solicitud: SolicitudDeSocio,
): Rechazo | null {
  const { socio, bloque, config } = solicitud;

  if (socio.estado !== EstadoSocio.ACTIVO) {
    // Sin mencionar la cuota: su problema es otro y pagarla no lo resuelve.
    return {
      tipo: 'MEMBRESIA_INACTIVA',
      mensaje:
        'Tu membresía no está activa. Acercate a la administración del club para ' +
        'reactivarla.',
    };
  }

  if (estaMoroso(socio, solicitud.hoyEnElClub)) {
    return {
      tipo: 'CUOTA_VENCIDA',
      mensaje:
        `Tu cuota está vencida desde el ${enDiaMesAno(socio.alDiaHasta)}. ` +
        'Ponete al día y vuelve a reservar; las reservas que ya tenías se mantienen.',
    };
  }

  if (solicitud.reservasDelDia >= config.cupoDiarioSocioHoras) {
    return {
      tipo: 'CUPO_DIARIO',
      mensaje:
        `Ya usaste tu cupo de hoy: ${enHoras(config.cupoDiarioSocioHoras)} por día. ` +
        'Tu próxima hora la puedes reservar mañana.',
    };
  }

  if (
    bloque.esPico &&
    solicitud.horasPicoDeLaSemana >= config.cupoPicoSemanalHoras
  ) {
    return {
      tipo: 'CUPO_PICO',
      mensaje:
        `Ya usaste tus ${enHoras(config.cupoPicoSemanalHoras)} en horario pico de ` +
        'esta semana. El cupo se renueva el lunes, y los horarios fuera de pico ' +
        'siguen disponibles.',
    };
  }

  if (solicitud.acompanantes.length === 0) {
    return {
      tipo: 'SIN_ACOMPANANTE',
      mensaje:
        'Declará con quién vas a jugar: otro socio del club, o un invitado que ' +
        'descuenta de tus invitados del mes.',
    };
  }

  if (solicitud.acompanantes.some((a) => a.socioId === socio.id)) {
    return {
      tipo: 'ACOMPANANTE_ES_TITULAR',
      mensaje: 'No puedes declararte a vos mismo como acompañante.',
    };
  }

  const enOtraCancha = solicitud.ocupados.find(
    (ocupado) =>
      participa(solicitud, ocupado.socioId) && sePisan(bloque, ocupado),
  );

  if (enOtraCancha) {
    // Nombra a quién y dónde: con cuatro jugadores declarados, un "conflicto de
    // horario" obliga a adivinar cuál de los cuatro es el problema.
    return {
      tipo: 'YA_ESTA_EN_OTRA_CANCHA',
      mensaje:
        `${enOtraCancha.nombre} ya está en la ${enOtraCancha.cancha} a esa hora. ` +
        'Nadie puede estar en dos canchas a la vez.',
    };
  }

  // Los de esta reserva se suman a los que ya lleva: mirando solo el historial, quien
  // tiene dos cupos libres podría declarar tres invitados de una vez y el mes cerraría
  // con cinco registrados.
  const invitados = solicitud.acompanantes.filter(esInvitadoExterno).length;

  if (solicitud.invitadosDelMes + invitados > config.invitadosPorMes) {
    return {
      tipo: 'CUPO_INVITADOS',
      mensaje:
        `${cuantosYCuantosQuedan(solicitud.invitadosDelMes, invitados, config.invitadosPorMes)} ` +
        // La renovación se mide contra el mes del bloque y no contra hoy, que es el
        // mes contra el que se contó el cupo: quien reserva en agosto una hora de
        // septiembre con su cupo de septiembre agotado tiene que leer "1 de octubre".
        `El cupo se renueva el ${primeroDelMesSiguiente(bloque.inicio)}, ` +
        'y jugar con otro socio del club no gasta invitados.',
    };
  }

  return null;
}

/**
 * Por qué no alcanza, en los dos casos en que puede no alcanzar.
 *
 * Con el cupo agotado basta decir cuántos lleva. Pero quien lleva 2 de 4 y declara 3 de
 * una vez leería "Llevas 2 de 4 invitados este mes" junto a un rechazo, y eso se ve
 * como una falla del sistema: ve dos cupos libres y que igual no lo dejan.
 */
function cuantosYCuantosQuedan(
  usados: number,
  declarados: number,
  limite: number,
): string {
  const quedan = Math.max(limite - usados, 0);

  if (quedan === 0) {
    return `Llevas ${usados} de ${limite} invitados este mes.`;
  }

  return (
    `Estás declarando ${declarados} invitados y solo te ` +
    `${quedan === 1 ? 'queda 1' : `quedan ${quedan}`} de tus ${limite} de este mes.`
  );
}

/** Un nombre y no un `socioId`: el socio acompañante no gasta cupo de nadie. */
function esInvitadoExterno(acompanante: AcompananteDeclarado): boolean {
  return acompanante.socioId == null && acompanante.numeroSocio == null;
}

/** El titular y los socios que declaró: los invitados externos no tienen identidad. */
function participa(solicitud: SolicitudDeSocio, socioId: number): boolean {
  return (
    socioId === solicitud.socio.id ||
    solicitud.acompanantes.some((a) => a.socioId === socioId)
  );
}

/**
 * Por rango y no por hora de inicio: `duracionBloqueMin` es configurable, y con
 * bloques de 90 minutos dos reservas que empiezan a horas distintas se pisan igual.
 *
 * Bordes abiertos arriba: el bloque que termina a las 20:00 no se pisa con el que
 * empieza a las 20:00, así que se puede jugar dos horas seguidas en canchas distintas.
 */
function sePisan(
  bloque: { inicio: Date; fin: Date },
  otro: { inicio: Date; fin: Date },
): boolean {
  return bloque.inicio < otro.fin && bloque.fin > otro.inicio;
}

/**
 * El día en que vence la cuota **todavía cuenta como al día**, igual que
 * `socioAlDia` en T8: la fecha del papel es la última que vale.
 */
function estaMoroso(socio: SocioQueReserva, hoyEnElClub: string): boolean {
  return socio.alDiaHasta < fechaDelClub(hoyEnElClub);
}

function enHoras(cantidad: number): string {
  return cantidad === 1 ? '1 hora' : `${cantidad} horas`;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * "1 de septiembre": cuándo vuelve a tener invitados.
 *
 * Cada límite dice cuál es y cuándo se renueva (`SPEC-reservas.md` § Reglas del socio).
 * "Cupo mensual alcanzado" a secas deja a la persona contando días en el calendario.
 *
 * **Recibe el inicio del bloque**, no la fecha de hoy: el cupo se cuenta contra el mes
 * en que se va a jugar, así que es ese el que se renueva.
 */
function primeroDelMesSiguiente(inicioDelBloque: Date): string {
  const delBloque = diaDelClub(inicioDelBloque).toISOString().slice(0, 10);
  const siguiente = new Date(mesDelClub(delBloque).hasta);

  return `1 de ${MESES[siguiente.getUTCMonth()]}`;
}

/** Como lo escribiría el club: 31-07-2026. */
function enDiaMesAno(fecha: Date): string {
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');

  return `${dia}-${mes}-${fecha.getUTCFullYear()}`;
}
