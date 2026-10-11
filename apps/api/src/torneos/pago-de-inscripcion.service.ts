import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  ConceptoPago,
  EstadoPagoInscripcion,
  EstadoTransaccion,
  type Prisma,
  type Transaccion,
} from '../generated/prisma/client';
import { ConfirmacionService } from '../pagos/confirmacion.service';
import { PagosService } from '../pagos/pagos.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvisosDeTorneo } from './correos';
import { InscripcionesAbandonadas } from './inscripciones-abandonadas.service';

/**
 * Pagar la inscripción con Webpay.
 *
 * **`pagos` no cambia: recibe un valor de enum más y nada más.** Sigue sin saber qué se
 * está pagando —un monto y una referencia opaca— y esa es justo la propiedad que hace
 * que el tercer concepto cueste una línea y no un módulo. La idempotencia, la
 * expiración y el monto autoritativo son los que `SPEC-pagos.md` ya define y no se
 * replican acá.
 *
 * El otro camino —subir el comprobante de una transferencia— **no pasa por acá**: no
 * hay pasarela ni nada que anular. Vive en `comprobantes.service.ts`.
 */
@Injectable()
export class PagoDeInscripcion {
  private readonly log = new Logger('Torneos');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagos: PagosService,
    private readonly confirmacion: ConfirmacionService,
    private readonly abandonadas: InscripcionesAbandonadas,
    private readonly avisos: AvisosDeTorneo,
  ) {}

  /**
   * Empieza el cobro y devuelve a dónde mandar a la persona.
   *
   * **El monto sale de `TorneoCategoria`, jamás del cliente.** Es el mismo criterio de
   * `SPEC-pagos.md` § Monto autoritativo: aceptarlo del navegador sería dejar que cada
   * jugador elija cuánto paga por inscribirse.
   */
  async iniciar(token: string, urlRetorno: string) {
    // Por el token y no por el id, como el comprobante: sin eso, cualquiera abre una
    // transacción a nombre de una inscripción ajena.
    const inscripcion = await this.prisma.inscripcionTorneo.findUnique({
      where: { token },
      select: {
        id: true,
        estadoPago: true,
        torneoCategoria: { select: { montoInscripcionClp: true } },
      },
    });

    if (!inscripcion) {
      throw new NotFoundException('No hay una inscripción con esa llave.');
    }

    if (inscripcion.estadoPago !== EstadoPagoInscripcion.PENDIENTE) {
      throw new ConflictException(
        inscripcion.estadoPago === EstadoPagoInscripcion.EXENTA
          ? 'Esa inscripción es gratis: no hay nada que pagar.'
          : 'Esa inscripción ya la revisó el club.',
      );
    }

    const montoClp = inscripcion.torneoCategoria.montoInscripcionClp;

    const pago = await this.pagos.iniciar({
      concepto: ConceptoPago.INSCRIPCION_TORNEO,
      conceptoId: inscripcion.id,
      montoClp,
      // **Sin usuario**: quien se inscribe desde la calle no tiene cuenta, que es la
      // razón de ser de todo T64. `Transaccion.usuarioId` ya era nulable justamente
      // para el no-socio que arrienda una hora.
      usuarioId: null,
      urlRetorno,
    });

    return {
      inscripcionId: inscripcion.id,
      montoClp,
      urlRedireccion: pago.urlRedireccion,
      tokenPasarela: pago.tokenPasarela,
    };
  }

  /**
   * La vuelta desde la pasarela.
   *
   * Marcar la inscripción va **dentro de la transacción del pago**, como en `cuotas` y
   * en la reserva del no-socio: o quedan las dos cosas o ninguna. Una transacción
   * autorizada sin su inscripción pagada es plata cobrada que el club le sigue
   * cobrando a la misma persona.
   */
  async confirmar(tokenPasarela: string) {
    // La inscripción que **esta** confirmación marcó pagada. Webpay repite el aviso, y
    // las repeticiones no marcan nada: así el correo sale una vez (T131).
    let pagada: number | null = null;

    const resultado = await this.confirmacion.confirmar(
      tokenPasarela,
      async (tx, transaccion) => {
        if (await this.aplicar(tx, transaccion))
          pagada = transaccion.conceptoId;
      },
    );

    // Fuera de la transacción del pago, ya escrita: el correo no puede deshacerla.
    if (pagada !== null) await this.avisos.pagoAprobado(pagada);

    // **El pago que no se autorizó suelta el cupo en el acto.** La pantalla le dice a
    // la persona que su inscripción no quedó tomada; hasta que esto existió, eso era
    // mentira durante los quince minutos que tardaba el barrido en pasar.
    if (resultado.estado !== EstadoTransaccion.AUTORIZADA) {
      await this.abandonadas.soltarPorTransaccion(resultado.transaccionId);
    }

    return resultado;
  }

  /** Marca la inscripción pagada. Responde si la marcó: no, si ya no estaba pendiente. */
  private async aplicar(
    tx: Prisma.TransactionClient,
    transaccion: Transaccion,
  ): Promise<boolean> {
    // El estado en el `where`: si el admin ya le aprobó el comprobante mientras la
    // persona pagaba en línea, esto no la vuelve a marcar. El dinero de más lo resuelve
    // alguien; marcarla dos veces borraría el rastro de cuál fue el cobro bueno.
    const { count } = await tx.inscripcionTorneo.updateMany({
      where: {
        id: transaccion.conceptoId,
        estadoPago: EstadoPagoInscripcion.PENDIENTE,
      },
      data: { estadoPago: EstadoPagoInscripcion.PAGADA },
    });

    if (count > 0) return true;

    // **No había nada que marcar, y eso es plata que entró sin contrapartida.**
    // Pasan dos cosas por acá y las dos las tiene que mirar una persona: que el club
    // ya le hubiera aprobado el pago por otra vía —cobrado dos veces— o que su
    // inscripción ya no exista, porque el barrido le soltó el cupo antes de que la
    // pasarela autorizara. Dejarlo en silencio era el agujero: la transacción quedaba
    // `AUTORIZADA` y perfecta, sin nadie inscrito del otro lado.
    await tx.transaccion.update({
      where: { id: transaccion.id },
      data: { requiereRevision: true },
    });
    this.log.error(
      `Transacción ${transaccion.id}: se autorizó el pago de la inscripción ` +
        `${transaccion.conceptoId}, que ya no está pendiente. Queda para revisión.`,
    );

    return false;
  }
}
