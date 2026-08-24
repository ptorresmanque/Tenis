import { BadRequestException, Injectable } from '@nestjs/common';

import {
  EstadoCuota,
  EstadoSocio,
  TipoCuota,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** "AAAA-MM", el período de una cuota mensual. */
const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * La cuota del mes, emitida cuando alguien la mira.
 *
 * **No hay tarea programada.** Un cron es una pieza de infraestructura que hay que
 * desplegar, vigilar y reintentar, y su fallo es silencioso: nadie nota que no corrió
 * hasta que un socio reclama que su cuota no aparece. Acá el acto de mirar es el que
 * emite, así que no puede fallar sin que se note.
 *
 * Lo que esta decisión **no** cubre, dicho antes de que sorprenda: si el club quiere
 * que salga un correo el día 1 recordando la cuota, eso sí necesita un disparador
 * temporal. Ese correo es la primera razón legítima para agregar un scheduler, y
 * cuando llegue, la emisión ya está resuelta y solo hay que llamarla.
 */
@Injectable()
export class EmisionDeCuotas {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El mes completo, emitiendo lo que falte.
   *
   * La emisión y la consulta son la misma operación a propósito: separarlas dejaría
   * un endpoint que hay que acordarse de llamar, que es el mismo problema del cron
   * con otra forma.
   */
  async delPeriodo(periodo: string) {
    exigirPeriodo(periodo);

    await this.emitir(periodo);

    const cuotas = await this.prisma.cuota.findMany({
      where: { periodo, tipo: TipoCuota.MENSUAL },
      orderBy: { socio: { numeroSocio: 'asc' } },
      select: {
        id: true,
        socioId: true,
        tipo: true,
        periodo: true,
        montoClp: true,
        descuentoClp: true,
        motivoDescuento: true,
        estado: true,
        pagadaEn: true,
        medio: true,
        socio: {
          select: {
            numeroSocio: true,
            usuario: { select: { nombre: true, apellido: true, email: true } },
          },
        },
      },
    });

    return {
      periodo,
      cuotas: cuotas.map(({ socio, ...cuota }) => ({
        ...cuota,
        // Aplanado acá y no en la pantalla: la lista se ordena y se busca por socio, y
        // con el usuario anidado cada consumidor tendría que armar el nombre otra vez.
        socio: {
          numeroSocio: socio.numeroSocio,
          nombre: `${socio.usuario.nombre} ${socio.usuario.apellido}`,
          email: socio.usuario.email,
        },
      })),
      totalEmitidoClp: cuotas.reduce(
        (suma, c) => suma + c.montoClp - c.descuentoClp,
        0,
      ),
      totalPagadoClp: cuotas
        .filter((c) => c.estado === EstadoCuota.PAGADA)
        .reduce((suma, c) => suma + c.montoClp - c.descuentoClp, 0),
    };
  }

  /**
   * Crea las que falten para ese período.
   *
   * **`skipDuplicates` sobre el único `(socioId, tipo, periodo)` es el mecanismo**, no
   * una precaución: dos peticiones simultáneas al mismo mes llegan las dos hasta acá,
   * y es la base la que decide que solo una fila entre. Chequear antes de insertar
   * dejaría una ventana de carrera, y lo que sale por esa ventana es una cuota
   * duplicada en el estado de cuenta de un socio.
   */
  private async emitir(periodo: string): Promise<void> {
    const config = await this.prisma.configuracionClub.findFirstOrThrow({
      select: { cuotaMensualClp: true },
    });

    const socios = await this.prisma.socio.findMany({
      where: {
        // Al suspendido no se le sigue cobrando; sus cuotas anteriores impagas quedan
        // como estaban.
        estado: EstadoSocio.ACTIVO,
        // Ni un mes antes de que entrara: un club que arranca en agosto no le debe
        // once meses a nadie. Se compara con el primer día del mes siguiente, así que
        // quien ingresó el 15 recibe la de ese mes, completa.
        fechaIngreso: { lt: primerDiaDelMesSiguiente(periodo) },
      },
      select: { id: true },
    });

    if (socios.length === 0) return;

    await this.prisma.cuota.createMany({
      data: socios.map((socio) => ({
        socioId: socio.id,
        tipo: TipoCuota.MENSUAL,
        periodo,
        montoClp: config.cuotaMensualClp,
      })),
      skipDuplicates: true,
    });
  }
}

export function exigirPeriodo(periodo: string): void {
  if (!FORMATO_PERIODO.test(periodo)) {
    throw new BadRequestException('El período se escribe como AAAA-MM.');
  }
}

/**
 * El primer instante del mes siguiente, para comparar contra `fechaIngreso`.
 *
 * Con `<` y no `<=` sobre el último día: `fechaIngreso` es `@db.Date` a medianoche
 * UTC, y comparar contra el día 31 dejaría fuera a quien ingresó ese mismo día.
 */
function primerDiaDelMesSiguiente(periodo: string): Date {
  const [anio, mes] = periodo.split('-').map(Number);

  return mes === 12
    ? new Date(`${anio + 1}-01-01T00:00:00.000Z`)
    : new Date(`${anio}-${String(mes + 1).padStart(2, '0')}-01T00:00:00.000Z`);
}
