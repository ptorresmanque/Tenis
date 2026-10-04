import { Injectable, NotFoundException } from '@nestjs/common';

import { fechaDelClub } from '../comun/tiempo';
import { PrismaService } from '../prisma/prisma.service';
import { calcularBloques, PASO_DE_LA_GRILLA_MIN } from './bloques';
import { franjaPara } from './franjas';

/** Lo que `reservas` y la grilla consumen. `SPEC-catalogo-canchas.md` § Contrato. */
export interface BloqueDisponible {
  inicio: Date;
  fin: Date;
  canchaId: number;
  /** Tarifa para el no-socio. Informativa: al reservar se recalcula. */
  montoClp: number;
  /** Lo usa `reservas` para el cupo pico semanal del socio. */
  esPico: boolean;
  bloqueado: boolean;
  motivoBloqueo: string | null;
}

/** Lo que la grilla necesita saber de una cancha para dibujar su columna. */
export interface CanchaPublica {
  id: number;
  nombre: string;
  superficie: string;
  techada: boolean;
  iluminacion: boolean;
}

@Injectable()
export class DisponibilidadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Las canchas que el público puede ver, en el orden que definió el club. */
  canchas(): Promise<CanchaPublica[]> {
    return this.prisma.cancha.findMany({
      where: { activa: true },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nombre: true,
        superficie: true,
        techada: true,
        iluminacion: true,
      },
    });
  }

  /**
   * Los bloques de una cancha en un día. No sabe de reservas: eso es de
   * `reservas`, que superpone las suyas sobre esto.
   */
  async de(canchaId: number, fecha: string): Promise<BloqueDisponible[]> {
    const dia = fechaDelClub(fecha);
    const diaSemana = dia.getUTCDay();

    const cancha = await this.prisma.cancha.findFirst({
      where: { id: canchaId, activa: true },
      select: { id: true },
    });

    if (!cancha) {
      // Una cancha desactivada responde igual que una que no existe: sigue en la
      // base por su historial, pero para el público ya no está.
      throw new NotFoundException('No hay una cancha activa con ese número.');
    }

    const [horarios, bloqueos, franjas] = await Promise.all([
      // `in: [id, null]` no sirve: Prisma no mezcla nulos con valores. El de la
      // cancha y el general del club, que es el que tiene `cancha_id` nulo.
      // El orden importa: `horario_apertura` no tiene único sobre (cancha, día)
      // —en MySQL dos filas con `cancha_id` nulo no chocan, ver T9—, así que puede
      // haber duplicados. Sin `orderBy`, cuál gana lo decide el plan de la
      // consulta y el club abriría a horas distintas sin que nadie tocara nada.
      // Gana el más reciente, la misma regla de desempate que las franjas.
      this.prisma.horarioApertura.findMany({
        where: { diaSemana, OR: [{ canchaId }, { canchaId: null }] },
        orderBy: { id: 'desc' },
      }),
      // Los que pisan el día, con un margen de un día a cada lado: el día civil
      // del club no coincide con el UTC y un bloqueo puede empezar la víspera.
      this.prisma.bloqueo.findMany({
        where: {
          canchaId,
          inicio: { lt: new Date(dia.getTime() + 2 * 24 * 60 * 60 * 1000) },
          fin: { gt: new Date(dia.getTime() - 24 * 60 * 60 * 1000) },
        },
      }),
      // La vigencia se filtra acá para no traer el histórico de tarifas entero;
      // la especificidad la resuelve `franjaPara`, que es donde está probada.
      this.prisma.franjaHoraria.findMany({
        where: {
          AND: [
            { OR: [{ canchaId }, { canchaId: null }] },
            { vigenteDesde: { lte: dia } },
            { OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: dia } }] },
          ],
        },
      }),
    ]);

    // El horario propio de la cancha gana al del club, igual que las franjas.
    const horario =
      horarios.find((h) => h.canchaId === canchaId) ??
      horarios.find((h) => h.canchaId === null);

    if (!horario) {
      // Ese día no abre. No es un error: es un domingo de invierno.
      return [];
    }

    const bloques = calcularBloques({
      fecha,
      horaApertura: horario.horaApertura,
      horaCierre: horario.horaCierre,
      // Una hora, empezando cada media hora (T78). La hora y media llega con T82, y
      // `duracionBloqueMin` de la configuración ya no manda sobre la grilla.
      duracionBloqueMin: 60,
      pasoMin: PASO_DE_LA_GRILLA_MIN,
      bloqueos,
    });

    return bloques.map((bloque) => ({
      ...bloque,
      canchaId,
      ...franjaPara({ fecha, canchaId, inicio: bloque.inicio, franjas }),
    }));
  }
}
