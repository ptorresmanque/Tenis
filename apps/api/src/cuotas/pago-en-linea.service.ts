import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import {
  ConceptoPago,
  EstadoCuota,
  MedioPago,
  TipoCuota,
} from '../generated/prisma/client';
import {
  CambiosDeSocio,
  SELECCION_AUDITADA,
} from '../identidad/socios/cambios.service';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { ConfirmacionService } from '../pagos/confirmacion.service';
import { PagosService } from '../pagos/pagos.service';
import { PrismaService } from '../prisma/prisma.service';
import { ultimoDiaDelPeriodo } from './periodos';

export interface PagoDeCuotaIniciado {
  cuotaId: number;
  montoClp: number;
  urlRedireccion: string;
}

/**
 * La cuota que el socio paga desde su casa.
 *
 * Es la pantalla que evita la conversación incómoda en el mesón, y usa el puerto que
 * ya existe: `cuotas` no habla con Transbank, le pide un cobro a `pagos` y espera el
 * resultado. **La idempotencia del callback duplicado está resuelta allá** —una
 * transacción `PENDIENTE` que solo puede cambiar de estado una vez— y no se vuelve a
 * resolver acá.
 */
@Injectable()
export class PagoEnLineaDeCuota {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagos: PagosService,
    private readonly confirmacion: ConfirmacionService,
    private readonly cambios: CambiosDeSocio,
  ) {}

  /** Lo que el socio debe, de los dos tipos y en orden. */
  async mias(yo: UsuarioActual) {
    // Sin ficha de socio, cuenta vacía y no 403: quien todavía no es socio llega a
    // esta pantalla desde el mismo menú, y un error se lee como que algo está roto.
    if (yo.socioId === null) return { cuotas: [], deudaClp: 0 };

    const cuotas = await this.prisma.cuota.findMany({
      where: { socioId: yo.socioId, estado: { not: EstadoCuota.ANULADA } },
      orderBy: [{ periodo: 'desc' }, { tipo: 'asc' }],
      select: {
        id: true,
        tipo: true,
        periodo: true,
        montoClp: true,
        descuentoClp: true,
        estado: true,
        pagadaEn: true,
        medio: true,
      },
    });

    return {
      cuotas,
      deudaClp: cuotas
        .filter((cuota) => cuota.estado === EstadoCuota.PENDIENTE)
        .reduce((suma, cuota) => suma + cuota.montoClp - cuota.descuentoClp, 0),
    };
  }

  /**
   * Empieza el cobro y devuelve a dónde mandar a la persona.
   *
   * El monto sale de la cuota emitida, nunca del cliente: es el que se congeló al
   * emitirla, y aceptarlo del navegador sería dejar que cada socio elija cuánto paga.
   */
  async iniciar(
    cuotaId: number,
    yo: UsuarioActual,
    urlRetorno: string,
  ): Promise<PagoDeCuotaIniciado> {
    const cuota = await this.prisma.cuota.findUnique({
      where: { id: cuotaId },
      select: {
        id: true,
        socioId: true,
        estado: true,
        montoClp: true,
        descuentoClp: true,
      },
    });

    if (!cuota) throw new NotFoundException('No hay una cuota con ese número.');

    if (cuota.socioId !== yo.socioId) {
      // Sin decir de quién es: quien prueba números ajenos no tiene que enterarse de
      // nada. Es el mismo criterio que la reserva de otro socio.
      throw new ForbiddenException('Esa cuota no es tuya.');
    }

    if (cuota.estado !== EstadoCuota.PENDIENTE) {
      throw new ConflictException(
        cuota.estado === EstadoCuota.PAGADA
          ? 'Esa cuota ya está pagada.'
          : 'Esa cuota está anulada: no hay nada que pagar.',
      );
    }

    const montoClp = cuota.montoClp - cuota.descuentoClp;

    const pago = await this.pagos.iniciar({
      concepto: ConceptoPago.CUOTA,
      conceptoId: cuota.id,
      montoClp,
      usuarioId: yo.id,
      urlRetorno,
    });

    return { cuotaId: cuota.id, montoClp, urlRedireccion: pago.urlRedireccion };
  }

  /**
   * La vuelta desde la pasarela.
   *
   * El efecto —marcar la cuota y extender la vigencia— va **dentro de la transacción
   * del pago**, como hace la reserva del no-socio: o quedan las dos cosas o ninguna.
   * Una transacción autorizada sin su cuota pagada es plata cobrada que el club le
   * sigue cobrando a la misma persona.
   */
  async confirmar(tokenPasarela: string) {
    return this.confirmacion.confirmar(tokenPasarela, (tx, transaccion) =>
      this.aplicar(
        tx,
        transaccion.conceptoId,
        transaccion.id,
        transaccion.usuarioId,
      ),
    );
  }

  private async aplicar(
    tx: Prisma.TransactionClient,
    cuotaId: number,
    transaccionId: number,
    quienPago: number | null,
  ): Promise<void> {
    // El estado en el `where`: si el club ya la cobró en el mesón mientras la persona
    // pagaba en línea, esto no la vuelve a marcar. El dinero de más lo resuelve una
    // persona; marcarla dos veces borraría el rastro de cuál fue el cobro bueno.
    const { count } = await tx.cuota.updateMany({
      where: { id: cuotaId, estado: EstadoCuota.PENDIENTE },
      data: {
        estado: EstadoCuota.PAGADA,
        medio: MedioPago.WEBPAY,
        pagadaEn: new Date(),
        transaccionId,
      },
    });

    if (count === 0) return;

    const cuota = await tx.cuota.findUniqueOrThrow({
      where: { id: cuotaId },
      select: { socioId: true, tipo: true, periodo: true },
    });

    // La incorporación no compra tiempo, compra la entrada.
    if (cuota.tipo !== TipoCuota.MENSUAL) return;

    const antes = await tx.socio.findUniqueOrThrow({
      where: { id: cuota.socioId },
      select: SELECCION_AUDITADA,
    });

    const hasta = ultimoDiaDelPeriodo(cuota.periodo);
    if (antes.alDiaHasta >= hasta) return;

    const despues = await tx.socio.update({
      where: { id: cuota.socioId },
      data: { alDiaHasta: hasta },
      select: SELECCION_AUDITADA,
    });

    // Lo registra quien inició el pago, que es el propio socio y no un admin. Si la
    // transacción no tiene usuario —no pasa hoy, pero el campo es nullable— queda el
    // nombre genérico en vez de inventar un responsable.
    await this.cambios.registrar(
      tx,
      cuota.socioId,
      antes,
      despues,
      { id: quienPago ?? 0, nombre: 'Pago en línea' },
      `Pago de la cuota ${cuota.periodo} por Webpay`,
    );
  }
}
