import { BadRequestException, Injectable } from '@nestjs/common';

import { calcularBloques } from '../catalogo-canchas/bloques';
import { franjaPara } from '../catalogo-canchas/franjas';
import { comoFechaCivil, fechaDelClub } from '../comun/tiempo';
import { EstadoReserva } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  agruparOcupacion,
  BloqueMedido,
  CorteDeOcupacion,
  estadoDelBloque,
  FilaDeOcupacion,
  porcentajeDeOcupacion,
} from './ocupacion';

export interface ReporteDeOcupacion {
  desde: string;
  hasta: string;
  corte: CorteDeOcupacion;
  bloques: number;
  ocupados: number;
  cerrados: number;
  libres: number;
  /** `null` cuando no hubo ni una hora que ofrecer en todo el período. */
  porcentajeOcupacion: number | null;
  filas: FilaDeOcupacion[];
  calculadoEn: string;
}

/**
 * Cuánta cancha se usó y cuánta se desperdició.
 *
 * **El denominador son los bloques que existieron de verdad**, según el horario de
 * apertura de cada cancha en cada día: la ocupación de un día en que la cancha abrió
 * cuatro horas no se mide contra veinticuatro. Se calcula con `calcularBloques`, la
 * misma función que dibuja la grilla que el socio ve, para que el reporte no pueda
 * contar horas que nadie pudo reservar.
 */
@Injectable()
export class OcupacionDeCancha {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cuántos días se pueden pedir de una vez.
   *
   * Un año son unos veinticinco mil bloques en memoria; cinco años, la vista se cae
   * sin decir por qué. Un tope explícito con su mensaje es mejor que un timeout.
   */
  private static readonly DIAS_MAXIMOS = 366;

  async reporte(
    desde: string,
    hasta: string,
    corte: CorteDeOcupacion,
  ): Promise<ReporteDeOcupacion> {
    const dias = this.diasDelRango(desde, hasta);
    const medidos = await this.medirBloques(dias);

    const cuenta = (cual: BloqueMedido['estado']) =>
      medidos.filter((bloque) => bloque.estado === cual).length;
    // El total sale de la **misma** función que cada fila: si el porcentaje se
    // calculara acá aparte, un cambio en la regla dejaría un total que no cuadra con
    // sus propias filas.
    const total = {
      bloques: medidos.length,
      ocupados: cuenta('OCUPADO'),
      cerrados: cuenta('CERRADO'),
      libres: cuenta('LIBRE'),
    };

    return {
      desde,
      hasta,
      corte,
      ...total,
      porcentajeOcupacion: porcentajeDeOcupacion(total),
      filas: agruparOcupacion(medidos, corte),
      calculadoEn: new Date().toISOString(),
    };
  }

  /**
   * Arma la grilla de cada cancha en cada día y clasifica bloque por bloque.
   *
   * Todo se trae en cinco consultas y el cruce se hace en memoria: hacerlo por cada
   * par (cancha, día) serían ocho canchas por treinta y un días de ida y vuelta a la
   * base para dibujar un mes.
   */
  private async medirBloques(dias: string[]): Promise<BloqueMedido[]> {
    const primero = fechaDelClub(dias[0]);
    const ultimo = fechaDelClub(dias[dias.length - 1]);
    const dia = 24 * 60 * 60 * 1000;

    const [config, canchas, horarios, bloqueos, reservas, franjas] =
      await Promise.all([
        this.prisma.configuracionClub.findFirstOrThrow(),
        // Las activas: el reporte contesta "cómo andan mis canchas", y una dada de
        // baja ya no es una cancha del club aunque su historial siga ahí.
        this.prisma.cancha.findMany({
          where: { activa: true },
          select: { id: true, nombre: true, techada: true },
        }),
        this.prisma.horarioApertura.findMany({ orderBy: { id: 'desc' } }),
        // Con un día de margen a cada lado: el día civil del club no coincide con el
        // UTC y un bloqueo puede empezar la víspera.
        this.prisma.bloqueo.findMany({
          where: {
            inicio: { lt: new Date(ultimo.getTime() + 2 * dia) },
            fin: { gt: new Date(primero.getTime() - dia) },
          },
          select: { canchaId: true, inicio: true, fin: true, motivo: true },
        }),
        this.prisma.reserva.findMany({
          where: {
            estado: EstadoReserva.CONFIRMADA,
            inicio: { lt: new Date(ultimo.getTime() + 2 * dia) },
            fin: { gt: new Date(primero.getTime() - dia) },
          },
          select: { canchaId: true, inicio: true, fin: true },
        }),
        this.prisma.franjaHoraria.findMany(),
      ]);

    // Indexados por cancha una sola vez. Filtrar dentro del bucle recorría todas las
    // reservas del rango por cada par (día, cancha): con un año y ocho canchas son
    // casi tres mil pasadas sobre decenas de miles de filas.
    const porCancha = <T extends { canchaId: number }>(filas: T[]) => {
      const mapa = new Map<number, T[]>();
      for (const fila of filas) {
        mapa.set(fila.canchaId, [...(mapa.get(fila.canchaId) ?? []), fila]);
      }

      return mapa;
    };
    const bloqueosDe = porCancha(bloqueos);
    const reservasDe = porCancha(reservas);

    const medidos: BloqueMedido[] = [];

    for (const fecha of dias) {
      const diaSemana = fechaDelClub(fecha).getUTCDay();

      for (const cancha of canchas) {
        // El horario propio de la cancha gana al del club, y el más reciente gana
        // entre iguales: la misma precedencia que usa la grilla. Sin horario, ese día
        // no abre, y no abrir no es tener cero ocupación: es no tener bloques.
        const horario =
          horarios.find(
            (uno) => uno.diaSemana === diaSemana && uno.canchaId === cancha.id,
          ) ??
          horarios.find(
            (uno) => uno.diaSemana === diaSemana && uno.canchaId === null,
          );

        if (!horario) continue;

        const suyos = calcularBloques({
          fecha,
          horaApertura: horario.horaApertura,
          horaCierre: horario.horaCierre,
          duracionBloqueMin: config.duracionBloqueMin,
          bloqueos: bloqueosDe.get(cancha.id) ?? [],
        });

        const ocupantes = reservasDe.get(cancha.id) ?? [];

        for (const bloque of suyos) {
          medidos.push({
            cancha: cancha.nombre,
            techada: cancha.techada,
            esPico: franjaPara({
              fecha,
              canchaId: cancha.id,
              inicio: bloque.inicio,
              franjas,
            }).esPico,
            estado: estadoDelBloque(bloque, ocupantes),
          });
        }
      }
    }

    return medidos;
  }

  /** Los días civiles del rango, de `desde` a `hasta` inclusive. */
  private diasDelRango(desde: string, hasta: string): string[] {
    const fin = fechaDelClub(hasta);
    const corriendo = fechaDelClub(desde);

    if (fin.getTime() < corriendo.getTime()) {
      throw new BadRequestException(
        'El rango termina antes de empezar: revisa las fechas.',
      );
    }

    const dias: string[] = [];
    while (corriendo.getTime() <= fin.getTime()) {
      if (dias.length >= OcupacionDeCancha.DIAS_MAXIMOS) {
        throw new BadRequestException(
          `El reporte de ocupación se pide de a ${OcupacionDeCancha.DIAS_MAXIMOS} días como máximo.`,
        );
      }

      dias.push(comoFechaCivil(corriendo));
      // En UTC sobre medianoches: acá no hay horario de verano que corra un día. El
      // que sí lo tiene en cuenta es `calcularBloques`, que avanza por el reloj.
      corriendo.setUTCDate(corriendo.getUTCDate() + 1);
    }

    return dias;
  }
}
