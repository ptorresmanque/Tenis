import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { borrarImagen, guardarImagen } from '../comun/imagenes';
import {
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  MedioPagoInscripcion,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvisosDeTorneo } from './correos';
import { InscripcionesAbandonadas } from './inscripciones-abandonadas.service';

/**
 * El comprobante de transferencia y su aprobación.
 *
 * **Este camino no pasa por `pagos`**, y es deliberado: no hay pasarela, no hay
 * transacción y no hay nada que anular. Es un archivo que el admin mira y aprueba.
 * Meterlo en `Transaccion` convertiría esa tabla en un registro de dos cosas distintas
 * — ver `SPEC-pagos.md`, la nota de `INSCRIPCION_TORNEO`.
 */
@Injectable()
export class ComprobantesDeInscripcion {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abandonadas: InscripcionesAbandonadas,
    private readonly avisos: AvisosDeTorneo,
  ) {}

  /**
   * Sube el comprobante de una inscripción.
   *
   * **Uno por inscripción**: el segundo reemplaza al primero y borra el archivo viejo.
   * Sin eso, una inscripción es un buzón de subida ilimitado en un endpoint sin sesión
   * — y el cobro, que es la defensa principal del formulario público, no cubre este
   * camino porque acá no hay pasarela que cobre.
   *
   * **Solo sobre una inscripción `PENDIENTE`.** Una `PAGADA` no necesita comprobante y
   * una `RECHAZADA` ya la miró el admin: aceptar archivos ahí sería dejar que alguien
   * reabra una decisión tomada, subiendo otra imagen.
   */
  async subir(token: string, bytes: Buffer): Promise<{ id: number }> {
    // **Se busca por el token, no por el id.** Los ids son correlativos: con ellos,
    // cualquiera podía pisar la transferencia de otro y conseguir que el club le
    // rechazara un pago que sí hizo —y rechazar libera el cupo, así que además quedaba
    // fuera del torneo—. Lo destapó la revisión de T66 con una sonda.
    const inscripcion = await this.prisma.inscripcionTorneo.findUnique({
      where: { token },
      select: { id: true, estadoPago: true, comprobanteRuta: true },
    });

    // El mismo 404 que si no existiera: quien prueba tokens ajenos no tiene que
    // enterarse de si acertó el formato. Es el criterio de la cuota de otro socio.
    if (!inscripcion) {
      throw new NotFoundException('No hay una inscripción con esa llave.');
    }

    const hecho = await this.adjuntar(inscripcion, bytes);

    // Lo subió el jugador: el club tiene algo que revisar (T130). El que sube el admin
    // desde el panel, en `subirComoAdmin`, no avisa: ya lo tiene en la mano.
    await this.avisos.comprobanteRecibido(hecho.id);

    return hecho;
  }

  /**
   * El mismo comprobante, subido **por el admin** desde el panel.
   *
   * Es el jugador que manda su transferencia por WhatsApp: el club la guarda como
   * respaldo de lo que está por aprobar. Hasta acá solo se podía subir desde la
   * pantalla pública, con el token que el panel no tiene.
   *
   * **Por id y no por token, y eso está bien acá**: la razón de usar el token en el
   * camino público es que los ids son correlativos y cualquiera podía pisar el
   * comprobante de otro. Este endpoint vive detrás del guard de admin, donde el que
   * llama ya es el club.
   */
  async subirComoAdmin(id: number, bytes: Buffer): Promise<{ id: number }> {
    const inscripcion = await this.prisma.inscripcionTorneo.findUnique({
      where: { id },
      select: { id: true, estadoPago: true, comprobanteRuta: true },
    });

    if (!inscripcion) {
      throw new NotFoundException('No hay una inscripción con ese número.');
    }

    return this.adjuntar(inscripcion, bytes);
  }

  /** Guarda la imagen y reemplaza la anterior, venga de donde venga. */
  private async adjuntar(
    inscripcion: {
      id: number;
      estadoPago: EstadoPagoInscripcion;
      comprobanteRuta: string | null;
    },
    bytes: Buffer,
  ): Promise<{ id: number }> {
    if (inscripcion.estadoPago !== EstadoPagoInscripcion.PENDIENTE) {
      throw new ConflictException(
        inscripcion.estadoPago === EstadoPagoInscripcion.EXENTA
          ? 'Esa inscripción es gratis: no hay nada que pagar.'
          : 'Esa inscripción ya la revisó el club. Llámanos si hay un error.',
      );
    }

    const guardada = await guardarImagen(bytes, 'comprobantes');

    await this.prisma.inscripcionTorneo.update({
      where: { id: inscripcion.id },
      data: { comprobanteRuta: guardada.ruta },
    });

    // Después de escribir la ruta nueva, no antes: si el borrado fallara primero, la
    // fila quedaría apuntando a un archivo que ya no está.
    if (inscripcion.comprobanteRuta) {
      await borrarImagen(inscripcion.comprobanteRuta);
    }

    return { id: inscripcion.id };
  }

  /** La bandeja del admin: lo que está esperando que alguien lo mire. */
  async pendientes() {
    // **Barre antes de mostrar.** El que eligió Webpay y cerró la ventana de pago
    // aparecía en esta bandeja como si esperara que alguien mirara su comprobante, y
    // no hay comprobante que mirar. Va sin acotar porque la bandeja tampoco lo está:
    // es la única lectura del sistema que mira todos los torneos a la vez.
    await this.abandonadas.liberar({});

    const filas = await this.prisma.inscripcionTorneo.findMany({
      where: {
        estadoPago: EstadoPagoInscripcion.PENDIENTE,
        estado: { not: EstadoInscripcionTorneo.RETIRADA },
      },
      orderBy: { inscritaEn: 'asc' },
      select: {
        id: true,
        inscritaEn: true,
        comprobanteRuta: true,
        jugador: { select: { nombre: true, apellido: true, telefono: true } },
        torneo: { select: { id: true, nombre: true } },
        torneoCategoria: {
          select: {
            montoInscripcionClp: true,
            categoriaJuego: { select: { nombre: true } },
          },
        },
      },
    });

    return filas.map((fila) => ({
      id: fila.id,
      jugador: `${fila.jugador.nombre} ${fila.jugador.apellido}`,
      // El teléfono va en la bandeja del admin a propósito: es a quien hay que llamar
      // si el comprobante no cuadra, y no tenerlo obliga a abrir otra pantalla.
      telefono: fila.jugador.telefono,
      torneoId: fila.torneo.id,
      torneo: fila.torneo.nombre,
      categoria: fila.torneoCategoria.categoriaJuego.nombre,
      montoClp: fila.torneoCategoria.montoInscripcionClp,
      tieneComprobante: fila.comprobanteRuta !== null,
      inscritaEn: fila.inscritaEn,
    }));
  }

  /** El admin miró el comprobante y era. */
  /**
   * Da el pago por bueno, y **deja dicho cómo se pagó**.
   *
   * El medio importa para el que anota el admin: es el que llega al mesón y paga en
   * efectivo, y su inscripción nace sin comprobante y sin medio. Sin registrarlo, el
   * club no tiene con qué cuadrar la caja al final del torneo.
   *
   * **Opcional a propósito.** Aprobar el comprobante de una transferencia que la
   * persona ya declaró no necesita repetir el medio: ya está escrito desde que se
   * inscribió, y sobreescribirlo con un valor por omisión sería perder el dato.
   */
  async aprobar(
    id: number,
    medioPago: MedioPagoInscripcion | null = null,
  ): Promise<{ id: number }> {
    const hecho = await this.resolver(
      id,
      EstadoPagoInscripcion.PAGADA,
      null,
      medioPago,
    );

    // Después de resolver, que choca con un 409 si otro admin llegó antes: el correo
    // sale una vez (T131).
    await this.avisos.pagoAprobado(id);

    return hecho;
  }

  /**
   * El admin miró el comprobante y no era.
   *
   * **Libera el cupo**: la inscripción sale del cuadro y pasa a `RETIRADA`, con lo que
   * su columna generada se anula y el lugar queda libre para el primero de la espera.
   * Dejarla dentro sin pagar sería un cupo ocupado por alguien que no va a jugar.
   */
  async rechazar(id: number, motivo: string): Promise<{ id: number }> {
    const hecho = await this.resolver(
      id,
      EstadoPagoInscripcion.RECHAZADA,
      motivo,
    );

    // Con el motivo y que su lugar quedó libre (T131).
    await this.avisos.pagoRechazado(id);

    return hecho;
  }

  private async resolver(
    id: number,
    estadoPago: EstadoPagoInscripcion,
    motivo: string | null,
    medioPago: MedioPagoInscripcion | null = null,
  ): Promise<{ id: number }> {
    // **El estado va en el `where`**, como en el resto del módulo: dos admins mirando
    // la misma bandeja no pueden aprobar y rechazar la misma fila, y el segundo lee que
    // ya estaba resuelta en vez de pisar la decisión del primero.
    const { count } = await this.prisma.inscripcionTorneo.updateMany({
      where: { id, estadoPago: EstadoPagoInscripcion.PENDIENTE },
      data: {
        estadoPago,
        motivoRechazo: motivo,
        // Solo si vino: nulo significa "no lo dijo", no "bórralo".
        ...(medioPago ? { medioPago } : {}),
        ...(estadoPago === EstadoPagoInscripcion.RECHAZADA
          ? { estado: EstadoInscripcionTorneo.RETIRADA, siembra: null }
          : {}),
      },
    });

    if (count === 0) {
      throw new ConflictException(
        'Esa inscripción ya no está pendiente: alguien la resolvió antes.',
      );
    }

    return { id };
  }

  /**
   * La ruta del archivo, para servirlo.
   *
   * **Detrás del guard de admin**, al revés que las fotos del torneo: un comprobante de
   * transferencia lleva el nombre, el banco y el número de cuenta de una persona. Es
   * dato del club, no del sitio público — dos carpetas con dos reglas, no una carpeta
   * con una excepción.
   */
  async rutaDelComprobante(id: number): Promise<string> {
    const inscripcion = await this.prisma.inscripcionTorneo.findUnique({
      where: { id },
      select: { comprobanteRuta: true },
    });

    if (!inscripcion?.comprobanteRuta) {
      throw new NotFoundException('Esa inscripción no tiene comprobante.');
    }

    return inscripcion.comprobanteRuta;
  }
}
