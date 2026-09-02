import { Injectable, Logger } from '@nestjs/common';

import {
  ConceptoPago,
  EstadoPagoInscripcion,
  EstadoTransaccion,
  MedioPagoInscripcion,
  type Prisma,
} from '../generated/prisma/client';
import { limiteDeExpiracion } from '../pagos/expiracion';
import { ExpiracionService } from '../pagos/expiracion.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * El cupo del que dijo que iba a pagar y no pagó.
 *
 * **El pago es condición para estar inscrito, y esta es la mitad que el servidor sí
 * puede imponer.** Exigir el medio de pago en el formulario dejó fuera al que nunca
 * quiso pagar, pero no al que aprieta "Pagar con Webpay" y **cierra la ventana**: la
 * pasarela no avisa cuando alguien cierra una pestaña, así que esa inscripción se
 * quedaba viva, ocupando lugar, hasta que alguien la mirara a mano. Con cupos de 8 en
 * Honor, tres personas distraídas dejan el cuadro sin armar.
 *
 * **Es el mismo mecanismo con que `reservas` libera una cancha abandonada**, y no uno
 * nuevo: `SPEC-pagos.md` § Expiración deja las transacciones sin terminar en
 * `EXPIRADA` a los 15 minutos, y acá se traduce a cupo libre. Se copia también la
 * decisión de dónde corre —**al leer, no en un job programado**—: un cron es una pieza
 * más que instalar y monitorear, y que falla en silencio; el barrido ocurre justo
 * cuando su resultado se va a usar.
 *
 * **Se borra la fila y no se marca.** Quien no pagó nunca estuvo inscrito, así que no
 * hay nada que contarle al club: dejarla como retirada llenaría el panel de gente que
 * nunca entró y le impediría volver a inscribirse sin que nadie la desatasque. El
 * rastro de que alguien empezó y abandonó queda en su `Transaccion`, que no se toca.
 */
@Injectable()
export class InscripcionesAbandonadas {
  private readonly log = new Logger('Torneos');

  constructor(
    private readonly prisma: PrismaService,
    private readonly expiracion: ExpiracionService,
  ) {}

  /**
   * Suelta el cupo de las inscripciones sin pagar que ya no van a pagarse.
   *
   * `donde` acota a lo que se está mirando —un cuadro, un torneo, el año del
   * calendario—. **No es un detalle de eficiencia**: la primera versión del barrido de
   * `reservas` traía todas las expiradas del sistema en cada carga de la grilla, y esa
   * lista solo crece. Acá el error sería el mismo.
   *
   * Tres condiciones, y las tres importan:
   *
   * - **`medioPago = WEBPAY`.** La transferencia trae una imagen esperando que el admin
   *   la mire y puede tardar días; la que anotó el admin a mano es de alguien que va a
   *   pagar en efectivo en el mesón. Ninguna de las dos se toca.
   * - **Pasada la ventana del pago.** La misma de `pagos`, no una propia: dos relojes
   *   distintos para el mismo abandono se contradicen el día que uno cambia.
   * - **Sin transacción viva.** Una `PENDIENTE` es alguien que puede estar tecleando su
   *   tarjeta en este segundo, y una `AUTORIZADA` es plata que entró. Borrar cualquiera
   *   de las dos es cobrarle a alguien por un cupo que le acabamos de quitar.
   */
  async liberar(donde: Prisma.InscripcionTorneoWhereInput): Promise<number> {
    const candidatas = await this.prisma.inscripcionTorneo.findMany({
      where: {
        ...donde,
        medioPago: MedioPagoInscripcion.WEBPAY,
        estadoPago: EstadoPagoInscripcion.PENDIENTE,
        inscritaEn: { lt: limiteDeExpiracion() },
      },
      select: { id: true },
    });

    if (candidatas.length === 0) return 0;

    // Primero se expira lo de `pagos` y después se lee: al revés, la transacción que
    // acaba de vencer todavía figura como pendiente y su inscripción sobrevive una
    // vuelta más. Es el orden de `disponibilidad-publica.service.ts`.
    await this.expiracion.barrer();

    const pagando = await this.prisma.transaccion.findMany({
      where: {
        concepto: ConceptoPago.INSCRIPCION_TORNEO,
        conceptoId: { in: candidatas.map((una) => una.id) },
        estado: {
          in: [EstadoTransaccion.PENDIENTE, EstadoTransaccion.AUTORIZADA],
        },
      },
      select: { conceptoId: true },
    });

    const vivas = new Set(pagando.map((una) => una.conceptoId));
    const sueltas = candidatas
      .map((una) => una.id)
      .filter((id) => !vivas.has(id));

    if (sueltas.length === 0) return 0;

    // Las franjas horarias se van con ella por el `onDelete: Cascade` de la relación.
    const { count } = await this.prisma.inscripcionTorneo.deleteMany({
      where: { id: { in: sueltas } },
    });

    if (count > 0) {
      this.log.log(
        `Se soltaron ${count} inscripciones que eligieron Webpay y no pagaron.`,
      );
    }

    return count;
  }

  /**
   * Suelta la inscripción de quien apretó **"Anular compra"** en Webpay.
   *
   * Es la única forma de abandono que la pasarela sí avisa, y avisa en el momento: no
   * hay por qué hacerle esperar quince minutos al cupo. Webpay vuelve sin `token_ws` y
   * con `TBK_ORDEN_COMPRA`, que es la `referencia` de la transacción — el mismo camino
   * que `ReservaNoSocio.anularDesdeRetorno`.
   */
  async anularDesdeRetorno(referencia: string): Promise<void> {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: { referencia },
      select: { conceptoId: true, concepto: true },
    });

    if (transaccion?.concepto !== ConceptoPago.INSCRIPCION_TORNEO) return;

    await this.soltar(transaccion.conceptoId);
  }

  /**
   * Suelta la inscripción de un pago que **no** quedó autorizado.
   *
   * Con la tarjeta rechazada la pantalla le dice a la persona que su inscripción no
   * quedó tomada, y hasta que esto existió eso era mentira: la fila seguía viva
   * ocupando cupo hasta que pasara el barrido. Un mensaje que miente durante quince
   * minutos es peor que no decir nada.
   */
  async soltarPorTransaccion(transaccionId: number): Promise<void> {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: { id: transaccionId },
      select: { conceptoId: true, concepto: true },
    });

    if (transaccion?.concepto !== ConceptoPago.INSCRIPCION_TORNEO) return;

    await this.soltar(transaccion.conceptoId);
  }

  /**
   * Suelta el cupo de quien **volvió atrás sin pagar**, en el momento.
   *
   * Apretar "atrás" en el navegador no le avisa a nadie —la pasarela no sabe que pasó y
   * el servidor tampoco—, pero esa persona vuelve a estar en nuestra página, y eso sí
   * lo sabe la pantalla: es ella quien llama acá con la llave que le devolvió su
   * inscripción. Sin esto, su cupo quedaba tomado hasta un cuarto de hora y, peor, su
   * propia inscripción sin pagar le contestaba "ya estás inscrito" cuando intentaba de
   * nuevo.
   *
   * **Responde lo mismo exista o no.** Es un endpoint sin sesión: quien prueba llaves
   * ajenas no tiene por qué enterarse de si acertó, y el token —122 bits— es lo único
   * que hace de credencial. No lanza: quien vuelve a la página puede traer una llave
   * vieja y eso no es un error que mostrarle.
   */
  async soltarPorToken(token: string): Promise<{ soltada: boolean }> {
    const inscripcion = await this.prisma.inscripcionTorneo.findUnique({
      where: { token },
      select: { id: true },
    });

    if (!inscripcion) return { soltada: false };

    return { soltada: await this.soltar(inscripcion.id) };
  }

  /**
   * Borra una inscripción que se quedó sin pago, si todavía está esperando pagarlo.
   *
   * **El estado va en el `where` y no en un `if` previo**: si el admin la aprobó entre
   * medio —o la persona pagó por otra vía—, una pestaña vieja no la borra.
   */
  private async soltar(inscripcionId: number): Promise<boolean> {
    const { count } = await this.prisma.inscripcionTorneo.deleteMany({
      where: {
        id: inscripcionId,
        medioPago: MedioPagoInscripcion.WEBPAY,
        estadoPago: EstadoPagoInscripcion.PENDIENTE,
      },
    });

    return count > 0;
  }
}
