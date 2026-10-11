import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { comoFechaCivil } from '../comun/tiempo';
import { EstadoPartidoInterno, EstadoSocio } from '../generated/prisma/client';
import { EnviadorCorreo, enviarOAnotar } from '../identidad/correo';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { web } from '../comun/urls';
import { firmaDelClub } from '../comun/club';
import { NOMBRE_DEL_SOCIO, nombreDeSocio } from './nombres';
import { PrismaService } from '../prisma/prisma.service';
import type { PartidoInternoNuevo } from './partidos-internos.dto';

/** El día del partido. `jugadoEn` es un `DATE`: llega como medianoche UTC del día civil. */
const DIA_JUGADO = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Un partido como lo ve uno de los dos que jugaron. */
export interface PartidoMio {
  id: number;
  /** El otro. Cada uno ve al que tuvo enfrente, no una pareja de nombres. */
  rival: string;
  ganeYo: boolean;
  marcador: string | null;
  jugadoEn: string;
  estado: EstadoPartidoInterno;
  /** Si me toca a mí contestar. Es lo que decide si se dibuja el botón. */
  esperaMiRespuesta: boolean;
  resueltoPorAdmin: boolean;
}

/** Un partido como lo ve el club cuando alguien reclama. */
export interface PartidoEnDisputa {
  id: number;
  socioA: string;
  socioB: string;
  ganador: string;
  marcador: string | null;
  jugadoEn: string;
  estado: EstadoPartidoInterno;
  resueltoPorAdmin: boolean;
}

const FICHA = {
  id: true,
  socioAId: true,
  socioBId: true,
  ganadorSocioId: true,
  marcador: true,
  jugadoEn: true,
  estado: true,
  resueltoPorAdmin: true,
  socioA: { select: NOMBRE_DEL_SOCIO },
  socioB: { select: NOMBRE_DEL_SOCIO },
  ganador: { select: NOMBRE_DEL_SOCIO },
} as const;

/**
 * Los partidos amistosos entre socios.
 *
 * **Un partido no puntúa hasta que el rival lo confirma.** Es la regla que sostiene
 * todo el ranking interno: sin ella la tabla la escribe quien más se acuerda de cargar
 * sus victorias, y deja de ser creíble el primer mes. Por eso quien carga es siempre
 * `socioA` —sale de la sesión, no del cuerpo— y quien contesta es siempre `socioB`.
 *
 * **La confirmación es un botón en "mis partidos"**, y desde T110 el rival recibe además un
 * correo que se lo avisa: sin ese empujón, el partido esperaba hasta que el rival entrara
 * por otra razón.
 *
 * Este servicio **no calcula Elo**. Deja los partidos y su estado; T56 los recorre.
 */
@Injectable()
export class PartidosInternos {
  private readonly log = new Logger('Correo');

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: EnviadorCorreo,
  ) {}

  /**
   * Un socio carga un partido que jugó.
   *
   * Las dos reglas de abajo son de servicio y no de base: **MariaDB no acepta un CHECK
   * sobre una columna con clave foránea**, la misma pared que encontró
   * `InscripcionClase` en T47. Sin ellas, el Elo movería el puntaje de alguien que no
   * estuvo en la cancha o le sumaría a alguien un partido contra sí mismo.
   */
  async cargar(yo: UsuarioActual, datos: PartidoInternoNuevo) {
    const mio = this.exigirFicha(yo);

    if (datos.rivalSocioId === mio) {
      throw new BadRequestException('Un partido se juega contra otra persona.');
    }

    if (
      datos.ganadorSocioId !== mio &&
      datos.ganadorSocioId !== datos.rivalSocioId
    ) {
      throw new BadRequestException(
        'El ganador tiene que ser uno de los dos que jugaron.',
      );
    }

    const rival = await this.prisma.socio.findUnique({
      where: { id: datos.rivalSocioId },
      select: { id: true },
    });

    if (!rival) {
      throw new NotFoundException('No hay un socio con ese número de ficha.');
    }

    const partido = await this.prisma.partidoInterno.create({
      data: {
        socioAId: mio,
        socioBId: datos.rivalSocioId,
        ganadorSocioId: datos.ganadorSocioId,
        marcador: datos.marcador,
        jugadoEn: datos.jugadoEn,
      },
      select: { id: true, estado: true },
    });

    // Después de crearlo: el partido queda cargado aunque el correo no salga.
    await this.avisarAlRival(partido.id);

    return partido;
  }

  /**
   * El correo al rival de un partido recién cargado (T110): quién lo cargó, quién ganó y
   * dónde confirmarlo. A quien lo cargó no le llega nada: ya sabe lo que hizo.
   *
   * Si algo falla —la consulta o el envío— queda en el log y el partido sigue cargado.
   */
  private async avisarAlRival(partidoId: number): Promise<void> {
    try {
      const [partido, club] = await Promise.all([
        this.prisma.partidoInterno.findUniqueOrThrow({
          where: { id: partidoId },
          select: {
            marcador: true,
            jugadoEn: true,
            ganadorSocioId: true,
            socioBId: true,
            socioA: { select: NOMBRE_DEL_SOCIO },
            socioB: {
              select: {
                usuario: {
                  select: { nombre: true, apellido: true, email: true },
                },
              },
            },
            ganador: { select: NOMBRE_DEL_SOCIO },
          },
        }),
        this.prisma.configuracionClub.findFirstOrThrow(),
      ]);

      const quienCargo = nombreDeSocio(partido.socioA);
      const quienGano =
        partido.ganadorSocioId === partido.socioBId
          ? 'ganaste tú'
          : `ganó ${nombreDeSocio(partido.ganador)}`;

      await enviarOAnotar(
        this.correo,
        {
          para: partido.socioB.usuario.email,
          asunto: `${quienCargo} cargó un partido contigo`,
          cuerpo:
            `Hola ${partido.socioB.usuario.nombre}:\n\n` +
            `${quienCargo} cargó el partido que jugaron el ` +
            `${DIA_JUGADO.format(partido.jugadoEn)}: ${quienGano}` +
            `${partido.marcador ? `, ${partido.marcador}` : ''}.\n\n` +
            'No suma al ranking hasta que lo confirmes. Si está bien, confírmalo; si no, ' +
            'recházalo. Las dos cosas se hacen en "Mis partidos":\n' +
            `${web()}/mis-partidos\n\n` +
            firmaDelClub(club),
        },
        this.log,
        `No salió el aviso del partido ${partidoId}`,
      );
    } catch (falla) {
      this.log.error(
        `No se pudo armar el aviso del partido ${partidoId}: ${String(falla)}`,
      );
    }
  }

  /**
   * Mis partidos, los que cargué y los que espero contestar.
   *
   * Los más nuevos primero: la lista se abre para contestar lo último, no para leer
   * el historial.
   */
  async mios(yo: UsuarioActual): Promise<PartidoMio[]> {
    // Quien todavía no tiene ficha no tiene partidos, y esa es la verdad: un 403 se
    // lee como que el sistema está roto. Mismo criterio que `GET /api/cuotas/mias`.
    if (yo.socioId === null) return [];

    const mio = yo.socioId;
    const partidos = await this.prisma.partidoInterno.findMany({
      where: { OR: [{ socioAId: mio }, { socioBId: mio }] },
      orderBy: [{ jugadoEn: 'desc' }, { cargadoEn: 'desc' }],
      select: FICHA,
    });

    return partidos.map((partido) => {
      const soyA = partido.socioAId === mio;

      return {
        id: partido.id,
        rival: nombreDeSocio(soyA ? partido.socioB : partido.socioA),
        ganeYo: partido.ganadorSocioId === mio,
        marcador: partido.marcador,
        jugadoEn: comoFechaCivil(partido.jugadoEn),
        estado: partido.estado,
        // **Solo al rival le toca contestar.** Si le apareciera también a quien lo
        // cargó, podría confirmarse a sí mismo con un clic y la regla no existiría.
        esperaMiRespuesta:
          !soyA && partido.estado === EstadoPartidoInterno.PENDIENTE,
        resueltoPorAdmin: partido.resueltoPorAdmin,
      };
    });
  }

  /**
   * Contra quién puedo cargar un partido.
   *
   * **Sale el nombre y el número de socio, nada más.** No es el padrón: es la lista
   * para elegir rival en un formulario, y por eso vive acá y no en `identidad` como un
   * `GET /api/socios` general que después alguien reusaría para otra cosa. Ni teléfono
   * ni correo ni estado de cuenta: quién juega en el club ya está a la vista de
   * cualquiera que pase por las canchas, lo demás no.
   */
  async rivales(yo: UsuarioActual) {
    if (yo.socioId === null) return [];

    // Fuera los retirados y **no** los suspendidos: el que se fue del club no juega
    // más, pero el suspendido sigue siendo socio y su suspensión es de reservas, no
    // de la cancha. `cargar` a propósito no repite este filtro: un partido contra
    // alguien que después se retiró se jugó igual y tiene que poder registrarse.
    const socios = await this.prisma.socio.findMany({
      where: { id: { not: yo.socioId }, estado: { not: EstadoSocio.RETIRADO } },
      orderBy: [
        { usuario: { apellido: 'asc' } },
        { usuario: { nombre: 'asc' } },
      ],
      select: { id: true, numeroSocio: true, ...NOMBRE_DEL_SOCIO },
    });

    return socios.map((socio) => ({
      socioId: socio.id,
      numeroSocio: socio.numeroSocio,
      nombre: nombreDeSocio(socio),
    }));
  }

  /** El rival dice que sí. Desde acá el partido puntúa. */
  confirmar(yo: UsuarioActual, id: number) {
    return this.contestar(yo, id, EstadoPartidoInterno.CONFIRMADO);
  }

  /**
   * El rival dice que no.
   *
   * No hay disputa que resolver entre dos versiones: el partido queda `RECHAZADO` y no
   * puntúa. Si alguien reclama, lo arregla el club a mano.
   */
  rechazar(yo: UsuarioActual, id: number) {
    return this.contestar(yo, id, EstadoPartidoInterno.RECHAZADO);
  }

  /**
   * El club resuelve una disputa a mano.
   *
   * **Es la salida de emergencia que evita construir un tribunal**, y por eso queda
   * marcada: una tabla que se movió porque alguien del club llamó por teléfono tiene
   * que poder explicarse. Funciona desde cualquier estado, que es justamente para lo
   * que existe: el caso normal es rehacer un rechazo que no correspondía.
   */
  async resolver(id: number, estado: EstadoPartidoInterno) {
    const { count } = await this.prisma.partidoInterno.updateMany({
      where: { id },
      data: {
        estado,
        resueltoPorAdmin: true,
        confirmadoEn:
          estado === EstadoPartidoInterno.CONFIRMADO ? new Date() : null,
      },
    });

    if (count === 0) {
      throw new NotFoundException('No hay un partido con ese número.');
    }

    return { id, estado };
  }

  /** Los partidos que el club puede tener que mirar, filtrados por estado. */
  async paraElClub(estado?: EstadoPartidoInterno): Promise<PartidoEnDisputa[]> {
    const partidos = await this.prisma.partidoInterno.findMany({
      where: estado ? { estado } : {},
      orderBy: [{ jugadoEn: 'desc' }, { id: 'desc' }],
      select: FICHA,
    });

    return partidos.map((partido) => ({
      id: partido.id,
      socioA: nombreDeSocio(partido.socioA),
      socioB: nombreDeSocio(partido.socioB),
      ganador: nombreDeSocio(partido.ganador),
      marcador: partido.marcador,
      jugadoEn: comoFechaCivil(partido.jugadoEn),
      estado: partido.estado,
      resueltoPorAdmin: partido.resueltoPorAdmin,
    }));
  }

  /**
   * Contestar es pasar de `PENDIENTE` a cerrado, y solo lo hace el rival.
   *
   * El cambio va con el estado en el `where`: **dos toques al botón, o dos pestañas
   * abiertas, no tienen que escribir los dos**. Sin esa condición el segundo pisa al
   * primero y `confirmadoEn` termina con la hora equivocada. Es el mismo
   * compare-and-set que usan las reservas y las inscripciones.
   */
  private async contestar(
    yo: UsuarioActual,
    id: number,
    estado: EstadoPartidoInterno,
  ) {
    const mio = this.exigirFicha(yo);

    const partido = await this.prisma.partidoInterno.findUnique({
      where: { id },
      select: { socioBId: true },
    });

    if (!partido) {
      throw new NotFoundException('No hay un partido con ese número.');
    }

    // **Quien lo cargó no puede confirmarlo**: si pudiera, la confirmación no
    // existiría. Un tercero tampoco, que no jugó.
    if (partido.socioBId !== mio) {
      throw new ForbiddenException(
        'Ese partido lo tiene que contestar el rival que jugó.',
      );
    }

    const { count } = await this.prisma.partidoInterno.updateMany({
      where: { id, estado: EstadoPartidoInterno.PENDIENTE },
      data: {
        estado,
        // Se llama `confirmadoEn`, así que solo se escribe cuando hubo confirmación.
        // Ponerlo también al rechazar convertía la columna en "cuándo contestó" sin
        // avisarle a nadie, y encima dejaba a los dos caminos —éste y el del admin—
        // guardando cosas distintas para la misma operación.
        confirmadoEn:
          estado === EstadoPartidoInterno.CONFIRMADO ? new Date() : null,
      },
    });

    if (count === 0) {
      throw new ConflictException('Ese partido ya estaba contestado.');
    }

    return { id, estado };
  }

  private exigirFicha(yo: UsuarioActual): number {
    if (yo.socioId === null) {
      throw new ForbiddenException('Esto es solo para socios del club.');
    }

    return yo.socioId;
  }
}
