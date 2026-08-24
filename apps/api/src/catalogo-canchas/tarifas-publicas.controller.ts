import { Controller, Get, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/** Una fila de la lista de precios, como se publica. */
interface TarifaPublica {
  /** Nulo = rige en todas las canchas. */
  canchaId: number | null;
  cancha: string | null;
  /** Nulo = todos los días. */
  diaSemana: number | null;
  horaDesde: string;
  horaHasta: string;
  esPico: boolean;
  montoClp: number;
}

/**
 * La lista de precios y el horario, sin cuenta.
 *
 * El perfil pide publicar tarifas y horarios; hoy solo se ven bloque por bloque en la
 * grilla, que sirve para reservar y **no para responder "¿cuánto sale una hora los
 * sábados?"**. Se expone la franja y no el bloque: es el precio de lista.
 *
 * Nada de esto es sensible. Tenerlo detrás de una cuenta es exactamente la barrera de
 * entrada que describe la problemática 2.5 del perfil.
 */
@Injectable()
export class TarifasPublicasService {
  constructor(private readonly prisma: PrismaService) {}

  async tarifas(ahora = new Date()): Promise<TarifaPublica[]> {
    const franjas = await this.prisma.franjaHoraria.findMany({
      where: {
        // Las cerradas no salen: la pregunta pública es qué vale hoy, y el precio del
        // año pasado solo confunde a quien lo lee.
        vigenteDesde: { lte: ahora },
        OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }],
        // La de una cancha desactivada tampoco: el club la sacó de circulación y
        // anunciar su precio hace que alguien pregunte por una hora que no existe. La
        // general —`canchaId` nulo— sí, porque rige en las que quedan.
        cancha: { is: { activa: true } },
      },
      orderBy: [{ canchaId: 'asc' }, { horaDesde: 'asc' }],
      select: {
        canchaId: true,
        diaSemana: true,
        horaDesde: true,
        horaHasta: true,
        esPico: true,
        montoClp: true,
        cancha: { select: { nombre: true } },
      },
    });

    const generales = await this.prisma.franjaHoraria.findMany({
      where: {
        canchaId: null,
        vigenteDesde: { lte: ahora },
        OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }],
      },
      orderBy: { horaDesde: 'asc' },
      select: {
        canchaId: true,
        diaSemana: true,
        horaDesde: true,
        horaHasta: true,
        esPico: true,
        montoClp: true,
      },
    });

    return [
      ...generales.map((franja) => ({ ...franja, cancha: null })),
      ...franjas.map(({ cancha, ...franja }) => ({
        ...franja,
        cancha: cancha?.nombre ?? null,
      })),
    ];
  }

  /**
   * Cuándo abre el club.
   *
   * Separado en general y por cancha porque así lo entiende quien lo lee: "abrimos de
   * 8 a 22, salvo la 3 que cierra antes". Aplanarlo en una lista de siete días por
   * cancha sería una tabla de veintiuna filas para decir lo mismo.
   */
  async horarios() {
    const [general, canchas] = await Promise.all([
      this.prisma.horarioApertura.findMany({
        where: { canchaId: null },
        orderBy: { diaSemana: 'asc' },
        select: { diaSemana: true, horaApertura: true, horaCierre: true },
      }),
      this.prisma.cancha.findMany({
        where: { activa: true, horarios: { some: {} } },
        orderBy: { orden: 'asc' },
        select: {
          nombre: true,
          horarios: {
            orderBy: { diaSemana: 'asc' },
            select: { diaSemana: true, horaApertura: true, horaCierre: true },
          },
        },
      }),
    ]);

    return {
      general,
      porCancha: canchas.map((cancha) => ({
        cancha: cancha.nombre,
        horarios: cancha.horarios,
      })),
    };
  }
}

@Controller()
export class TarifasPublicasController {
  constructor(private readonly servicio: TarifasPublicasService) {}

  @Get('tarifas')
  tarifas() {
    return this.servicio.tarifas();
  }

  @Get('horarios')
  horarios() {
    return this.servicio.horarios();
  }
}
