import { Injectable, NotFoundException } from '@nestjs/common';

import { EstadoSocio } from '../generated/prisma/client';
import { UsuarioActual } from '../identidad/usuario-actual';
import { PrismaService } from '../prisma/prisma.service';
import { AcompananteDeclarado } from './cupo';
import {
  fechaCivilDelClub,
  ReservaCreada,
  ReservasService,
} from './reservas.service';

/** Lo que el mesón alcanza a ver del cupo antes de tomar la hora por teléfono. */
export interface CupoDelSocio {
  socioId: number;
  nombre: string;
  numeroSocio: string;
  estado: string;
  /** La cuota al día: si no, el club decide si igual le toma la hora. */
  alDia: boolean;
  reservasDelDia: number;
  cupoDiarioSocioHoras: number;
  horasPicoDeLaSemana: number;
  cupoPicoSemanalHoras: number;
  invitadosDelMes: number;
  invitadosPorMes: number;
}

export interface ReservaDelAdmin {
  canchaId: number;
  inicio: Date;
  /** A nombre de un socio del club. Sin esto, es una reserva de visitante. */
  socioId?: number | null;
  /** Datos del visitante, cuando no hay socio. */
  nombre?: string;
  email?: string;
  telefono?: string;
  acompanantes?: AcompananteDeclarado[];
}

/**
 * La reserva que toma el club por teléfono o en el mesón.
 *
 * **Pasa por las mismas reglas que la del socio** (decisión § 5.2 del plan): si el
 * socio ya usó su hora del día, el club se entera acá y no cuando el socio reclame
 * que se le fue un cupo que no pidió. Por eso este servicio no crea la reserva por su
 * cuenta: arma el `UsuarioActual` del socio y delega en `ReservasService`, que es
 * donde viven los cupos, los invitados y el bloqueo de la ficha.
 *
 * La del visitante sí es distinta: nace **confirmada y sin pasarela**, porque el
 * cobro ocurre en el mesón. Es la única forma de reserva pagada fuera de Webpay, y es
 * a propósito: el club atiende gente que llega sin teléfono.
 */
@Injectable()
export class ReservaDelAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservas: ReservasService,
  ) {}

  /** Cuánto le queda al socio hoy, para decidir antes de tomarle la hora. */
  async cupoDe(socioId: number, fecha: string): Promise<CupoDelSocio> {
    const socio = await this.prisma.socio.findUnique({
      where: { id: socioId },
      select: {
        id: true,
        numeroSocio: true,
        estado: true,
        alDiaHasta: true,
        usuario: { select: { nombre: true, apellido: true } },
      },
    });

    if (!socio) throw new NotFoundException('Ese socio no existe.');

    const config = await this.prisma.configuracionClub.findFirstOrThrow();
    const cuenta = await this.reservas.ocupacionDelSocio(socio.id, fecha);

    return {
      socioId: socio.id,
      nombre: `${socio.usuario.nombre} ${socio.usuario.apellido}`.trim(),
      numeroSocio: socio.numeroSocio,
      estado: socio.estado,
      alDia: fechaCivilDelClub(socio.alDiaHasta) >= fecha,
      ...cuenta,
      cupoDiarioSocioHoras: config.cupoDiarioSocioHoras,
      cupoPicoSemanalHoras: config.cupoPicoSemanalHoras,
      invitadosPorMes: config.invitadosPorMes,
    };
  }

  async crear(datos: ReservaDelAdmin): Promise<ReservaCreada> {
    if (datos.socioId == null) {
      return this.reservas.reservarComoVisitanteDelMeson({
        canchaId: datos.canchaId,
        inicio: datos.inicio,
        nombre: datos.nombre ?? '',
        email: datos.email ?? '',
        telefono: datos.telefono ?? '',
      });
    }

    const socio = await this.prisma.socio.findUnique({
      where: { id: datos.socioId },
      select: {
        id: true,
        estado: true,
        alDiaHasta: true,
        usuario: { select: { id: true, nombre: true, email: true } },
      },
    });

    if (!socio) throw new NotFoundException('Ese socio no existe.');

    // El `UsuarioActual` se arma acá y no llega del guard: quien está autenticado es
    // el admin, y la reserva es del socio. Es el único dato que `reservarComoSocio`
    // necesita de la sesión, así que reconstruirlo es más barato —y más seguro— que
    // duplicar las reglas de cupo en un segundo camino.
    //
    // **Los dos estados salen de la ficha y no van fijos en `true`.** Hoy las reglas
    // releen al socio de la base y estos campos no deciden nada, así que un `true`
    // escrito a mano no cambiaba ningún resultado; lo que dejaba puesto era la
    // trampa: el día que alguien evalúe con `yo.socioAlDia`, el mesón se saltaría
    // la cuota sin que ningún test se entere.
    const comoElSocio: UsuarioActual = {
      id: socio.usuario.id,
      nombre: socio.usuario.nombre,
      email: socio.usuario.email,
      esAdmin: false,
      socioId: socio.id,
      socioActivo: socio.estado === EstadoSocio.ACTIVO,
      socioAlDia: fechaCivilDelClub(socio.alDiaHasta) >= fechaCivilDelClub(new Date()),
      profesorId: null,
    };

    return this.reservas.reservarComoSocio(comoElSocio, {
      canchaId: datos.canchaId,
      inicio: datos.inicio,
      acompanantes: datos.acompanantes ?? [],
    });
  }
}
