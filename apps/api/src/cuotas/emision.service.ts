import { BadRequestException, Injectable } from '@nestjs/common';

import { mesEnElClub } from '../comun/tiempo';
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
  async delPeriodo(periodo: string, ahora = new Date()) {
    exigirPeriodo(periodo);

    // **Los meses futuros no se emiten.** Un admin que navega al mes siguiente para
    // mirar dejaría cuotas emitidas por adelantado: después el club cuenta como
    // morosos a socios por meses que no empezaron, y si alguno se retira quedan
    // cuotas suyas de meses en que ya no era socio. Mirar el futuro devuelve lo que
    // hay —nada, normalmente— sin escribir.
    if (periodo <= mesEnElClub(ahora)) await this.emitir(periodo);

    const cuotas = await this.prisma.cuota.findMany({
      // Los dos tipos: la incorporación de un socio que entró este mes es deuda de
      // este mes, y esconderla dejaría al club cobrando la mitad de lo que emitió.
      where: { periodo },
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
      select: {
        cuotaMensualClp: true,
        cuotaIncorporacionClp: true,
        cobraIncorporacionDesde: true,
      },
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
      select: { id: true, fechaIngreso: true },
    });

    if (socios.length === 0) return;

    const mensuales = socios.map((socio) => ({
      socioId: socio.id,
      tipo: TipoCuota.MENSUAL,
      periodo,
      montoClp: config.cuotaMensualClp,
    }));

    // **La incorporación se emite en el mes en que el socio entró**, no en el que se
    // esté mirando: es un cobro por única vez y su período es el del alta. Solo a
    // quien ingresó después de la puesta en marcha; el padrón que el club ya tenía la
    // pagó hace años, fuera del sistema.
    const incorporaciones = socios
      .filter(
        (socio) =>
          socio.fechaIngreso >= config.cobraIncorporacionDesde &&
          mesDe(socio.fechaIngreso) === periodo,
      )
      .map((socio) => ({
        socioId: socio.id,
        tipo: TipoCuota.INCORPORACION,
        periodo,
        montoClp: config.cuotaIncorporacionClp,
      }));

    await this.prisma.cuota.createMany({
      data: [...mensuales, ...incorporaciones],
      skipDuplicates: true,
    });
  }
}

/** El mes de una fecha civil, "AAAA-MM". */
function mesDe(fecha: Date): string {
  return fecha.toISOString().slice(0, 7);
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
