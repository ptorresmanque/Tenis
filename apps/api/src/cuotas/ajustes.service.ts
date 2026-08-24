import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { EstadoCuota, TipoCuota } from '../generated/prisma/client';
import {
  CambiosDeSocio,
  SELECCION_AUDITADA,
} from '../identidad/socios/cambios.service';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { PrismaService } from '../prisma/prisma.service';
import { ultimoDiaDelPeriodo } from './periodos';

/** Lo que el admin puede hacerle a una cuota que todavía no se cobró. */
export interface AjusteDeCuota {
  descuentoClp?: number;
  condonar?: boolean;
  anular?: boolean;
  motivo: string;
}

/**
 * Los casos que no son el camino feliz.
 *
 * **Anular y condonar no son lo mismo, y la diferencia importa.** Anular es deshacer
 * una emisión equivocada —la cuota del socio que ya se había retirado, la del mes
 * duplicado—: esa cuota nunca debió existir, así que no da derecho a nada. Condonar es
 * cobrar cero por una razón —el socio que estuvo lesionado medio año, el que hizo un
 * trabajo para el club—: el mes se lo dieron igual, así que **sí extiende la vigencia**.
 *
 * Ver `SPEC-cuotas.md` § Anular y condonar no son lo mismo.
 */
@Injectable()
export class AjustesDeCuota {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cambios: CambiosDeSocio,
  ) {}

  async ajustar(cuotaId: number, ajuste: AjusteDeCuota, yo: UsuarioActual) {
    const cuota = await this.prisma.cuota.findUnique({
      where: { id: cuotaId },
      select: {
        id: true,
        socioId: true,
        tipo: true,
        periodo: true,
        estado: true,
        montoClp: true,
      },
    });

    if (!cuota) throw new NotFoundException('No hay una cuota con ese número.');

    if (cuota.estado !== EstadoCuota.PENDIENTE) {
      // Sobre una pagada no se ajusta nada: si el cobro fue un error, el camino es la
      // devolución, que el club hace por caja. Automatizar la reversa de un cobro
      // autorizado es una operación de dinero que nadie pidió.
      throw new ConflictException(
        cuota.estado === EstadoCuota.PAGADA
          ? 'Esa cuota ya está pagada. Si el cobro fue un error, la devolución se hace en el club.'
          : 'Esa cuota ya está anulada.',
      );
    }

    if (ajuste.anular) {
      return this.prisma.cuota.update({
        where: { id: cuotaId },
        data: {
          estado: EstadoCuota.ANULADA,
          anuladaPor: yo.id,
          motivoAnulacion: ajuste.motivo,
        },
      });
    }

    const descuentoClp = ajuste.condonar
      ? cuota.montoClp
      : (ajuste.descuentoClp ?? 0);

    if (descuentoClp > cuota.montoClp) {
      // Sin esto el club le termina debiendo plata a un socio por una cuota.
      throw new BadRequestException(
        'El descuento no puede ser mayor que la cuota.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.cuota.update({
        where: { id: cuotaId },
        data: {
          descuentoClp,
          motivoDescuento: ajuste.motivo,
          // Condonar la deja pagada, sin medio: no entró plata, pero la deuda se
          // cerró. Un descuento parcial la deja pendiente por el resto.
          ...(ajuste.condonar
            ? { estado: EstadoCuota.PAGADA, pagadaEn: new Date() }
            : {}),
        },
      });

      if (ajuste.condonar && cuota.tipo === TipoCuota.MENSUAL) {
        await this.extenderVigencia(tx, cuota.socioId, cuota.periodo, yo);
      }

      return actualizada;
    });
  }

  /**
   * Quién debe, cuánto y desde cuándo.
   *
   * **Se cuenta sobre las cuotas `PENDIENTE`, no restando `alDiaHasta` contra hoy.**
   * Un socio puede tener agosto impago y septiembre pagado: la resta diría que debe
   * uno cuando debe otro, y el club llamaría por el mes equivocado.
   */
  async morosos() {
    const impagas = await this.prisma.cuota.findMany({
      where: { estado: EstadoCuota.PENDIENTE },
      orderBy: { periodo: 'asc' },
      select: {
        socioId: true,
        periodo: true,
        montoClp: true,
        descuentoClp: true,
        socio: {
          select: {
            numeroSocio: true,
            usuario: { select: { nombre: true, apellido: true, email: true } },
          },
        },
      },
    });

    const porSocio = new Map<
      number,
      {
        socioId: number;
        numeroSocio: string;
        nombre: string;
        email: string;
        cuotasImpagas: number;
        deudaClp: number;
        desdePeriodo: string;
      }
    >();

    for (const cuota of impagas) {
      const acumulado = porSocio.get(cuota.socioId) ?? {
        socioId: cuota.socioId,
        numeroSocio: cuota.socio.numeroSocio,
        nombre: `${cuota.socio.usuario.nombre} ${cuota.socio.usuario.apellido}`,
        email: cuota.socio.usuario.email,
        cuotasImpagas: 0,
        deudaClp: 0,
        // La lista viene ordenada por período, así que la primera que se ve de cada
        // socio es la más antigua: desde cuándo debe.
        desdePeriodo: cuota.periodo,
      };

      acumulado.cuotasImpagas += 1;
      acumulado.deudaClp += cuota.montoClp - cuota.descuentoClp;
      porSocio.set(cuota.socioId, acumulado);
    }

    // Del que más debe al que menos: el club atiende de arriba hacia abajo, y el orden
    // es la mitad de para qué sirve esta lista.
    return [...porSocio.values()].sort((a, b) => b.deudaClp - a.deudaClp);
  }

  private async extenderVigencia(
    tx: Prisma.TransactionClient,
    socioId: number,
    periodo: string,
    yo: UsuarioActual,
  ): Promise<void> {
    const antes = await tx.socio.findUniqueOrThrow({
      where: { id: socioId },
      select: SELECCION_AUDITADA,
    });

    const hasta = ultimoDiaDelPeriodo(periodo);
    if (antes.alDiaHasta >= hasta) return;

    const despues = await tx.socio.update({
      where: { id: socioId },
      data: { alDiaHasta: hasta },
      select: SELECCION_AUDITADA,
    });

    await this.cambios.registrar(
      tx,
      socioId,
      antes,
      despues,
      { id: yo.id, nombre: yo.nombre },
      `Cuota ${periodo} condonada`,
    );
  }
}

/**
 * Lee el ajuste del cuerpo.
 *
 * **El motivo es obligatorio en los tres casos**, y lo impone el servidor: un
 * descuento sin motivo no se distingue de un error de tipeo seis meses después, que es
 * justo cuando alguien pregunta por qué esa cuota es más barata.
 */
export function leerAjuste(cuerpo: unknown): AjusteDeCuota {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';
  if (motivo === '') {
    throw new BadRequestException(
      'Escribe por qué: queda en la cuota, y sin eso nadie puede explicarla después.',
    );
  }

  const anular = datos.anular === true;
  const condonar = datos.condonar === true;

  if (anular && condonar) {
    // Son decisiones opuestas: una dice que la cuota no correspondía y la otra que sí
    // pero no se cobra. Aceptar las dos obligaría a elegir una en silencio.
    throw new BadRequestException(
      'Anular y condonar son cosas distintas: elige una.',
    );
  }

  if (anular || condonar) return { anular, condonar, motivo };

  const descuentoClp = Number(datos.descuentoClp);
  if (!Number.isInteger(descuentoClp) || descuentoClp <= 0) {
    throw new BadRequestException(
      'El descuento va en pesos, como un número entero mayor que cero.',
    );
  }

  return { descuentoClp, motivo };
}
