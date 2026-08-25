import { comoFechaCivil } from '../comun/tiempo';

/**
 * El motor del ranking interno: Elo sobre los partidos entre socios.
 *
 * Puro: ni base de datos ni reloj —el día de hoy entra por parámetro—. Es la otra mitad
 * del módulo y **no comparte nada con el de torneos**, a propósito: puntos acumulados
 * premian jugar mucho, y eso es correcto para un torneo e incorrecto para los amistosos.
 * El socio jubilado que juega cuatro veces por semana terminaría arriba del que le gana
 * siempre pero juega los sábados.
 *
 * **El marcador no entra acá.** Ganar 6-0 6-0 mueve lo mismo que ganar 7-6 7-6: es cómo
 * funciona Elo y es deliberado, porque un sistema que premiara la paliza incentivaría
 * exactamente eso.
 */

/** Todos empiezan acá. Quien nunca jugó no aparece en la tabla, no aparece con 1200. */
export const ELO_INICIAL = 1200;

/** Lo máximo que un partido puede mover. */
export const K = 32;

/**
 * Cuántos meses sin jugar dejan a alguien fuera de la tabla principal.
 *
 * En meses y no en días porque así se dice y así se explica: "hace más de seis meses que
 * no juegas". El corte se calcula corriendo el mes, no restando 180 días.
 */
const MESES_DE_INACTIVIDAD = 6;

/**
 * Desde qué día hay que haber jugado para seguir en la tabla principal.
 *
 * **Exportada porque la pantalla anuncia este corte**, y el número tiene que salir del
 * mismo lugar que lo aplica. Calculado aparte en el servicio, cambiar los meses acá
 * dejaba la pantalla prometiendo un corte distinto del que el motor usa: es el mismo
 * error que el `hasta` del ranking de torneos, que prometía un tope que no existía.
 */
export function corteDeInactividad(hoy: Date): Date {
  const corte = new Date(hoy);
  corte.setUTCMonth(corte.getUTCMonth() - MESES_DE_INACTIVIDAD);

  return corte;
}

/** Un partido confirmado, con lo único que el Elo necesita mirarle. */
export interface PartidoConfirmado {
  socioAId: number;
  socioBId: number;
  ganadorSocioId: number;
  /** Fecha civil del club. Es lo primero que ordena. */
  jugadoEn: Date;
  /** En milisegundos. **Desempata dos partidos del mismo día**, y por eso existe. */
  cargadoEn: number;
}

/** Una fila de la tabla interna. */
export interface FilaInterna {
  /** `null` en los inactivos: están en la lista, pero no ocupan lugar. */
  puesto: number | null;
  socioId: number;
  nombre: string;
  elo: number;
  partidos: number;
  ganados: number;
  /** Fecha civil del último partido confirmado. */
  ultimoPartido: string;
  activo: boolean;
}

/**
 * La probabilidad de que gane quien tiene `propio`, contra quien tiene `rival`.
 *
 * Entre iguales es 0,5. Trescientos puntos de ventaja la llevan a 0,85, que es lo que
 * hace que ganarle a alguien mucho peor casi no sume.
 */
export function esperado(propio: number, rival: number): number {
  return 1 / (1 + 10 ** ((rival - propio) / 400));
}

/**
 * Cuánto mueve un partido: lo que suma el ganador y lo mismo que resta el perdedor.
 *
 * **Un solo número redondeado una sola vez.** Ésa es la razón de que esta función
 * devuelva el cambio en vez de los dos puntajes nuevos: calculando cada lado por
 * separado, `1215,5` y `1184,5` se redondean hacia arriba los dos y la tabla inventa un
 * punto en cada partido. Con un cambio único, lo que gana uno es exactamente lo que
 * pierde el otro, siempre.
 */
export function cambioDeElo(ganador: number, perdedor: number): number {
  return Math.round(K * (1 - esperado(ganador, perdedor)));
}

/** Lo que se sabe de un socio mientras se recorren los partidos. */
interface Acumulado {
  elo: number;
  partidos: number;
  ganados: number;
  ultimo: Date;
}

/**
 * La tabla interna completa.
 *
 * **Se calcula al vuelo, recorriendo todos los partidos confirmados en orden.** Es más
 * caro que la suma del ranking de torneos y sigue siendo trivial —con diez mil partidos
 * son unos pocos milisegundos—, y compra lo mismo: corregir un partido de marzo deja la
 * tabla correcta sin recalcular nada a mano.
 *
 * El orden se fija acá y no se deja al azar de la base: primero por el día en que se
 * jugó, y dentro del mismo día por el orden en que se cargaron. **Un ranking que da
 * números distintos en dos consultas seguidas no es un ranking.**
 *
 * @param partidos Solo los confirmados. Filtrarlos es de quien consulta.
 * @param nombres  Cómo se llama cada socio.
 * @param hoy      El día del club, para el corte de inactividad.
 */
export function tablaInterna(
  partidos: PartidoConfirmado[],
  nombres: Map<number, string>,
  hoy: Date,
): FilaInterna[] {
  const enOrden = [...partidos].sort(
    (uno, otro) =>
      uno.jugadoEn.getTime() - otro.jugadoEn.getTime() ||
      uno.cargadoEn - otro.cargadoEn,
  );

  const socios = new Map<number, Acumulado>();
  const traer = (socioId: number, cuando: Date): Acumulado => {
    const suyo = socios.get(socioId) ?? {
      elo: ELO_INICIAL,
      partidos: 0,
      ganados: 0,
      ultimo: cuando,
    };
    socios.set(socioId, suyo);

    return suyo;
  };

  for (const partido of enOrden) {
    const perdedorId =
      partido.ganadorSocioId === partido.socioAId
        ? partido.socioBId
        : partido.socioAId;

    const ganador = traer(partido.ganadorSocioId, partido.jugadoEn);
    const perdedor = traer(perdedorId, partido.jugadoEn);

    // El cambio se calcula con los dos Elo **antes** de tocar ninguno: usar el del
    // ganador ya actualizado daría un número distinto del que pierde el otro.
    const cambio = cambioDeElo(ganador.elo, perdedor.elo);

    ganador.elo += cambio;
    perdedor.elo -= cambio;
    ganador.ganados += 1;
    ganador.partidos += 1;
    perdedor.partidos += 1;
    ganador.ultimo = partido.jugadoEn;
    perdedor.ultimo = partido.jugadoEn;
  }

  const corte = corteDeInactividad(hoy);

  const filas = [...socios].map(([socioId, suyo]) => ({
    socioId,
    nombre: nombres.get(socioId) ?? `Socio ${socioId}`,
    elo: suyo.elo,
    partidos: suyo.partidos,
    ganados: suyo.ganados,
    ultimoPartido: comoFechaCivil(suyo.ultimo),
    // **Elo no caduca, pero la tabla sí se limpia.** Un ranking con alguien arriba
    // que no juega hace dos años no lo cree nadie; su puntaje queda intacto para
    // cuando vuelva.
    activo: suyo.ultimo.getTime() >= corte.getTime(),
  }));

  // Los activos primero y los inactivos al final: mezclados, la tabla se lee como si
  // los de abajo hubieran jugado mal, no como si no hubieran jugado.
  const ordenadas = filas.sort(
    (una, otra) =>
      Number(otra.activo) - Number(una.activo) ||
      otra.elo - una.elo ||
      una.nombre.localeCompare(otra.nombre, 'es'),
  );
  const activos = ordenadas.filter((fila) => fila.activo);

  return ordenadas.map((fila) => ({
    // El puesto se cuenta **solo entre los activos**: si los inactivos contaran, el
    // segundo de la tabla aparecería tercero sin que nadie entienda qué falta.
    puesto: fila.activo
      ? 1 + activos.filter((otra) => otra.elo > fila.elo).length
      : null,
    ...fila,
  }));
}
