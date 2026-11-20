import {
  BadGatewayException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import {
  comoFechaCivil,
  hoyEnElClub,
  instanteEnElClub,
  ZONA_DEL_CLUB,
} from '../comun/tiempo';
import {
  ConceptoPago,
  EstadoCuota,
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  EstadoReserva,
  EstadoTransaccion,
  MedioPago,
  MedioPagoInscripcion,
  TipoCuota,
} from '../generated/prisma/client';
import {
  CAMPOS_DEL_PAGO_WEBPAY,
  pagoWebpay,
  type PagoWebpay,
} from '../pagos/pago-webpay';
import {
  AnulacionService,
  LaPasarelaNoDevolvio,
} from '../pagos/anulacion.service';
import { PrismaService } from '../prisma/prisma.service';
import { aCsv } from '../reportes/csv';

/** De dónde sale el pago: la pasarela, o un cobro del mesón de una cuota o una inscripción. */
export type OrigenDelPago = 'webpay' | 'cuota' | 'inscripcion';
export type ConceptoDelPago = 'RESERVA' | 'CUOTA' | 'INSCRIPCION';
/** El de la transacción, o `MESON`: «Pagado en el mesón» (asunción 5). */
export type EstadoDelPago = EstadoTransaccion | 'MESON';
export type MedioDelPago = 'WEBPAY' | 'EFECTIVO' | 'TRANSFERENCIA';

/** Una fila de Finanzas › Pagos (T396, `SPEC-panel.md` § Los pagos del club). */
export interface FilaDePago {
  origen: OrigenDelPago;
  id: number;
  /** Cuándo se movió la plata (asunción 4). */
  fecha: Date;
  concepto: ConceptoDelPago;
  detalle: string;
  quien: string;
  esSocio: boolean;
  medio: MedioDelPago;
  tipoPago: string | null;
  montoClp: number;
  estado: EstadoDelPago;
  /** La orden de compra de Webpay; nula en el mesón. */
  referencia: string | null;
  codigoAutorizacion: string | null;
  /** Marcado para revisión y sin revisar todavía (asunción 6). */
  porRevisar: boolean;
}

export interface FiltroDePagos {
  /** Días del club, AAAA-MM-DD, los dos incluidos. */
  desde: string;
  hasta: string;
  /** Vacío es todos. */
  conceptos: ConceptoDelPago[];
  estado: EstadoDelPago | null;
  medio: MedioDelPago | null;
  q: string;
  porRevisar: boolean;
  orden: 'fecha' | 'monto';
  direccion: 'asc' | 'desc';
}

export interface ListadoDePagos {
  pagos: FilaDePago[];
  total: number;
  pagina: number;
  porPagina: number;
  /** Del filtro entero, no de la página (asunción 6). */
  resumen: { cobradoClp: number; devueltoClp: number; porRevisar: number };
}

/** Lo que se pagó, con el enlace al lugar del panel donde se ve. */
export interface Asociado {
  tipo: ConceptoDelPago;
  id: number;
  texto: string;
  enlace: string | null;
}

/** Si se puede devolver y, si no, por qué y adónde ir primero (asunción 9). */
export interface ReglaDeDevolucion {
  permitida: boolean;
  motivo: string | null;
  enlace: string | null;
}

export interface FichaDePago {
  fila: FilaDePago;
  /** Lo que dijo Webpay, con quién lo revisó o lo devolvió. Nulo en el mesón. */
  webpay:
    | (PagoWebpay & {
        revisadaPorNombre: string | null;
        anuladaPorNombre: string | null;
      })
    | null;
  /** Quién registró el cobro del mesón, si se guardó. */
  registradaPor: string | null;
  asociadoA: Asociado;
  /** Nula en el mesón: no pasó por la pasarela. */
  devolucion: ReglaDeDevolucion | null;
}

/** El de Personas: la misma página en todas las listas del panel. */
export const POR_PAGINA = 50;

const CONCEPTO_DE: Record<ConceptoPago, ConceptoDelPago> = {
  RESERVA: 'RESERVA',
  CUOTA: 'CUOTA',
  INSCRIPCION_TORNEO: 'INSCRIPCION',
};

/** Lo que se dice de lo pagado en una fila, y si sigue en pie para devolverlo. */
interface Descripcion {
  detalle: string;
  quien: string;
  esSocio: boolean;
  asociado: Asociado;
  /**
   * Si lo pagado sigue vigente para esta transacción, qué hacer antes de devolverla y adónde ir.
   * Sin enlace cuando no hay nada que hacer en el panel.
   */
  queHacerAntes: (
    transaccionId: number,
  ) => { texto: string; enlace: string | null } | null;
}

type TransaccionDeLaLista = Parameters<typeof pagoWebpay>[0] & {
  concepto: ConceptoPago;
  conceptoId: number;
};

/**
 * Finanzas › Pagos (T396): los pagos por Webpay y los cobros del mesón, en una lista.
 *
 * `ponytail:` las tres fuentes se juntan en memoria dentro del rango de fechas, y se filtran,
 * ordenan y paginan acá. Un mes del club son unos cientos de filas. Si el rango crece a años,
 * se pasa a una vista SQL con `UNION ALL` (asunción 11).
 */
@Injectable()
export class PagosDelClubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anulacion: AnulacionService,
  ) {}

  async listado(
    filtro: FiltroDePagos,
    pagina: number,
  ): Promise<ListadoDePagos> {
    const filas = await this.filas(filtro);

    return {
      pagos: filas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA),
      total: filas.length,
      pagina,
      porPagina: POR_PAGINA,
      resumen: {
        cobradoClp: suma(
          filas.filter(
            ({ estado }) =>
              estado === EstadoTransaccion.AUTORIZADA || estado === 'MESON',
          ),
        ),
        devueltoClp: suma(
          filas.filter(({ estado }) => estado === EstadoTransaccion.ANULADA),
        ),
        porRevisar: filas.filter(({ porRevisar }) => porRevisar).length,
      },
    };
  }

  /** El mismo filtro que la lista, sin paginar (asunción 10). */
  async csv(filtro: FiltroDePagos): Promise<string> {
    const filas = await this.filas(filtro);

    return aCsv(
      [
        'Fecha',
        'Concepto',
        'Detalle',
        'Quién pagó',
        'Socio o visitante',
        'Medio',
        'Tipo de pago',
        'Monto',
        'Estado',
        'Orden de compra',
        'Autorización',
        'Por revisar',
      ],
      filas.map((fila) => [
        fechaYHoraDelClub(fila.fecha),
        CONCEPTO_EN_PALABRAS[fila.concepto],
        fila.detalle,
        fila.quien,
        fila.esSocio ? 'Socio' : 'Visitante',
        MEDIO_EN_PALABRAS[fila.medio],
        fila.tipoPago ? (TIPO_DE_PAGO[fila.tipoPago] ?? fila.tipoPago) : null,
        fila.montoClp,
        ESTADO_EN_PALABRAS[fila.estado],
        fila.referencia,
        fila.codigoAutorizacion,
        fila.porRevisar ? 'Sí' : 'No',
      ]),
    );
  }

  async ficha(origen: OrigenDelPago, id: number): Promise<FichaDePago> {
    if (origen === 'webpay') return this.fichaDeWebpay(id);
    if (origen === 'cuota') return this.fichaDeCuota(id);
    return this.fichaDeInscripcion(id);
  }

  /**
   * «Devolver un pago» (T397, asunción 9): el total, por la pasarela, solo si la regla lo permite.
   * Queda quién y por qué (`anular` deja además cuándo). Dos a la vez no pagan dos veces: `anular`
   * cambia el estado con compare-and-set antes de pedir la plata.
   */
  async devolver(
    transaccionId: number,
    motivo: string,
    por: number,
  ): Promise<FichaDePago> {
    const { codigo, ...regla } = await this.reglaConCodigo(transaccionId);
    if (codigo !== null) {
      throw new ConflictException({
        motivo: codigo,
        message: regla.motivo,
        enlace: regla.enlace,
      });
    }

    let devuelto: boolean;
    try {
      devuelto = await this.anulacion.anular(transaccionId, { por, motivo });
    } catch (error) {
      if (error instanceof LaPasarelaNoDevolvio) {
        // El rechazo de Transbank, tal cual y al final (F8): el pago sigue autorizado.
        throw new BadGatewayException({
          motivo: 'LA_PASARELA_NO_DEVOLVIO',
          message:
            'Webpay no hizo la devolución, y el pago sigue autorizado. Reintenta en unos ' +
            `minutos; si vuelve a fallar, revísalo en el portal de Transbank. Detalle: ${error.message}`,
        });
      }

      // Cualquier otra falla puede llegar después de que Transbank devolvió (el commit de la base,
      // por ejemplo). No se sabe si la plata salió: no se dice que no, no se muestran detalles
      // internos, y queda por revisar con la causa en el log.
      await this.anulacion.marcarParaRevision(
        transaccionId,
        `devolución a mano sin confirmar: ${String(error)}`,
      );
      throw new InternalServerErrorException({
        motivo: 'DEVOLUCION_SIN_CONFIRMAR',
        message:
          'No sabemos si Webpay hizo la devolución. Revisa el pago en el portal de Transbank ' +
          'antes de reintentar; quedó por revisar.',
      });
    }

    // Otra persona la devolvió entre la regla y el compare-and-set de `anular`.
    if (!devuelto) {
      throw new ConflictException({
        motivo: 'YA_DEVUELTO',
        message: YA_DEVUELTO,
      });
    }

    return this.ficha('webpay', transaccionId);
  }

  /**
   * «Marcar como revisado» (T397, asunción 8): solo el pago con la marca, una vez, con la nota y
   * quién. La marca queda: dice que algo no cuadró; la revisión dice que alguien ya lo miró.
   */
  async revisar(
    transaccionId: number,
    nota: string,
    por: number,
  ): Promise<FichaDePago> {
    const transaccion = await this.transaccion(transaccionId);
    if (!transaccion.requiereRevision) {
      throw new ConflictException({
        motivo: 'NO_PIDE_REVISION',
        message: 'Este pago no está marcado para revisión.',
      });
    }

    // Compare-and-set: dos admins a la vez, y la primera nota es la que queda.
    const { count } = await this.prisma.transaccion.updateMany({
      where: { id: transaccionId, requiereRevision: true, revisadaEn: null },
      data: { revisadaPor: por, revisadaEn: new Date(), notaRevision: nota },
    });
    if (count === 0) {
      throw new ConflictException({
        motivo: 'YA_REVISADO',
        message:
          'Este pago ya se revisó. Vuelve a la ficha para ver quién lo hizo y su nota.',
      });
    }

    return this.ficha('webpay', transaccionId);
  }

  private async reglaConCodigo(transaccionId: number): Promise<ReglaConCodigo> {
    const transaccion = await this.transaccion(transaccionId);
    const descripcion = (await this.descripciones([transaccion])).get(
      claveDe(transaccion),
    )!;

    return devolucionDe(transaccion, descripcion);
  }

  /** Las filas de las tres fuentes en el rango, filtradas y ordenadas. */
  private async filas(filtro: FiltroDePagos): Promise<FilaDePago[]> {
    const rango = {
      gte: instanteEnElClub(filtro.desde, '00:00'),
      lt: instanteEnElClub(diaSiguiente(filtro.hasta), '00:00'),
    };

    const [transacciones, cuotas, inscripciones] = await Promise.all([
      this.prisma.transaccion.findMany({
        // La fecha es la de la confirmación o, si no llegó, la de inicio (asunción 4).
        where: {
          OR: [
            { confirmadaEn: rango },
            { confirmadaEn: null, creadaEn: rango },
          ],
        },
        select: { ...CAMPOS_DEL_PAGO_WEBPAY, concepto: true, conceptoId: true },
      }),
      this.prisma.cuota.findMany({
        where: { ...CUOTA_DEL_MESON, pagadaEn: rango },
        select: SELECT_CUOTA,
      }),
      this.prisma.inscripcionTorneo.findMany({
        where: { ...INSCRIPCION_DEL_MESON, inscritaEn: rango },
        select: SELECT_INSCRIPCION,
      }),
    ]);

    const descripciones = await this.descripciones(transacciones);
    const filas = [
      ...transacciones.map((transaccion) =>
        filaDeWebpay(transaccion, descripciones.get(claveDe(transaccion))!),
      ),
      ...cuotas.map(filaDeCuota),
      ...inscripciones.map(filaDeInscripcion),
    ];

    const q = normalizar(filtro.q.trim());
    const elegidas = filas.filter(
      (fila) =>
        (filtro.conceptos.length === 0 ||
          filtro.conceptos.includes(fila.concepto)) &&
        (filtro.estado === null || fila.estado === filtro.estado) &&
        (filtro.medio === null || fila.medio === filtro.medio) &&
        (!filtro.porRevisar || fila.porRevisar) &&
        (q === '' ||
          [fila.referencia, fila.codigoAutorizacion, fila.quien, fila.detalle]
            .filter((texto): texto is string => texto !== null)
            .some((texto) => normalizar(texto).includes(q))),
    );

    const signo = filtro.direccion === 'asc' ? 1 : -1;
    return elegidas.sort(
      (una, otra) =>
        signo *
          (filtro.orden === 'monto'
            ? una.montoClp - otra.montoClp
            : una.fecha.getTime() - otra.fecha.getTime()) ||
        // Empates: lo más nuevo primero, y por id para que la página no baile.
        otra.fecha.getTime() - una.fecha.getTime() ||
        otra.id - una.id,
    );
  }

  /**
   * Qué se pagó con cada transacción, con una consulta por concepto y no una por fila: la
   * reserva con su folio, cancha y hora; la cuota con su período y su socio; la inscripción con
   * su torneo y su categoría.
   */
  private async descripciones(
    transacciones: { concepto: ConceptoPago; conceptoId: number }[],
  ): Promise<Map<string, Descripcion>> {
    const idsDe = (concepto: ConceptoPago) =>
      transacciones
        .filter((una) => una.concepto === concepto)
        .map(({ conceptoId }) => conceptoId);

    const [reservas, cuotas, inscripciones] = await Promise.all([
      this.prisma.reserva.findMany({
        where: { id: { in: idsDe(ConceptoPago.RESERVA) } },
        select: {
          id: true,
          folio: true,
          nombre: true,
          socioId: true,
          estado: true,
          inicio: true,
          cancha: { select: { nombre: true } },
        },
      }),
      this.prisma.cuota.findMany({
        where: { id: { in: idsDe(ConceptoPago.CUOTA) } },
        select: { ...SELECT_CUOTA, estado: true, transaccionId: true },
      }),
      this.prisma.inscripcionTorneo.findMany({
        where: { id: { in: idsDe(ConceptoPago.INSCRIPCION_TORNEO) } },
        select: { ...SELECT_INSCRIPCION, estado: true, estadoPago: true },
      }),
    ]);

    const mapa = new Map<string, Descripcion>();

    for (const reserva of reservas) {
      const enlace =
        `/administracion/reservas?fecha=${comoFechaCivil(hoyEnElClub(reserva.inicio))}` +
        `&reserva=${reserva.id}`;
      const detalle = `Reserva ${reserva.folio} · ${reserva.cancha.nombre}, ${diaYHora(reserva.inicio)}`;
      const vigente = RESERVA_VIGENTE[reserva.estado];

      mapa.set(`${ConceptoPago.RESERVA}:${reserva.id}`, {
        detalle,
        quien: reserva.nombre,
        esSocio: reserva.socioId !== null,
        asociado: { tipo: 'RESERVA', id: reserva.id, texto: detalle, enlace },
        queHacerAntes: () =>
          vigente
            ? {
                texto:
                  'La reserva sigue vigente: cancélala desde la agenda. Si está dentro del ' +
                  'plazo, el pago se devuelve solo; si no, vuelve acá para devolverlo.',
                enlace,
              }
            : null,
      });
    }

    for (const cuota of cuotas) {
      const base = describirCuota(cuota);
      mapa.set(`${ConceptoPago.CUOTA}:${cuota.id}`, {
        ...base,
        // Vigente si sigue pagada con este cobro. Anulada, o pagada con otro (un pago
        // duplicado), ya no. Una cuota pagada no se anula en el panel (`AjustesService`): no hay
        // adónde mandar a nadie (revisión, T400).
        queHacerAntes: (transaccionId) =>
          cuota.estado === EstadoCuota.PAGADA &&
          cuota.transaccionId === transaccionId
            ? {
                texto:
                  'Esta cuota sigue pagada con este cobro, y una cuota pagada no se anula en ' +
                  'el panel. Si el cobro fue un error, la devolución se hace en el club.',
                enlace: null,
              }
            : null,
      });
    }

    for (const inscripcion of inscripciones) {
      const base = describirInscripcion(inscripcion);
      const vigente =
        inscripcion.estado !== EstadoInscripcionTorneo.RETIRADA &&
        inscripcion.estadoPago !== EstadoPagoInscripcion.RECHAZADA;
      mapa.set(`${ConceptoPago.INSCRIPCION_TORNEO}:${inscripcion.id}`, {
        ...base,
        queHacerAntes: () =>
          vigente
            ? {
                texto:
                  'La inscripción sigue vigente: retírala desde el torneo y vuelve acá para ' +
                  'devolver el pago.',
                enlace: base.asociado.enlace,
              }
            : null,
      });
    }

    // Lo pagado que ya no existe (una reserva que se fue con su cancha): la fila se muestra
    // igual, porque la plata se movió, y se puede devolver.
    for (const transaccion of transacciones) {
      if (mapa.has(claveDe(transaccion))) continue;
      const concepto = CONCEPTO_DE[transaccion.concepto];
      mapa.set(claveDe(transaccion), {
        detalle: `${CONCEPTO_EN_PALABRAS[concepto]} (ya no existe)`,
        quien: '—',
        esSocio: false,
        asociado: {
          tipo: concepto,
          id: transaccion.conceptoId,
          texto: `${CONCEPTO_EN_PALABRAS[concepto]} (ya no existe)`,
          enlace: null,
        },
        queHacerAntes: () => null,
      });
    }

    return mapa;
  }

  private async transaccion(id: number): Promise<TransaccionDeLaLista> {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: { id },
      select: { ...CAMPOS_DEL_PAGO_WEBPAY, concepto: true, conceptoId: true },
    });
    if (!transaccion) throw new NotFoundException('No encontramos ese pago.');

    return transaccion;
  }

  private async fichaDeWebpay(id: number): Promise<FichaDePago> {
    const transaccion = await this.transaccion(id);
    const descripcion = (await this.descripciones([transaccion])).get(
      claveDe(transaccion),
    )!;
    const nombres = await this.nombres([
      transaccion.revisadaPor,
      transaccion.anuladaPor,
    ]);

    return {
      fila: filaDeWebpay(transaccion, descripcion),
      webpay: {
        ...pagoWebpay(transaccion),
        revisadaPorNombre: nombres.get(transaccion.revisadaPor) ?? null,
        anuladaPorNombre: nombres.get(transaccion.anuladaPor) ?? null,
      },
      registradaPor: null,
      asociadoA: descripcion.asociado,
      devolucion: sinCodigo(devolucionDe(transaccion, descripcion)),
    };
  }

  private async fichaDeCuota(id: number): Promise<FichaDePago> {
    const cuota = await this.prisma.cuota.findFirst({
      where: { id, ...CUOTA_DEL_MESON },
      select: SELECT_CUOTA,
    });
    // La pagada por Webpay no es un cobro del mesón: se mira como transacción (asunción 3).
    if (!cuota) throw new NotFoundException('No encontramos ese cobro.');

    const nombres = await this.nombres([cuota.registradaPor]);

    return {
      fila: filaDeCuota(cuota),
      webpay: null,
      registradaPor: nombres.get(cuota.registradaPor) ?? null,
      asociadoA: describirCuota(cuota).asociado,
      devolucion: null,
    };
  }

  private async fichaDeInscripcion(id: number): Promise<FichaDePago> {
    const inscripcion = await this.prisma.inscripcionTorneo.findFirst({
      where: { id, ...INSCRIPCION_DEL_MESON },
      select: SELECT_INSCRIPCION,
    });
    if (!inscripcion) throw new NotFoundException('No encontramos ese cobro.');

    return {
      fila: filaDeInscripcion(inscripcion),
      webpay: null,
      // La inscripción no guarda quién aprobó el comprobante.
      registradaPor: null,
      asociadoA: describirInscripcion(inscripcion).asociado,
      devolucion: null,
    };
  }

  /** «Nombre Apellido» de cada usuario que tocó el pago. */
  private async nombres(
    ids: (number | null)[],
  ): Promise<Map<number | null, string>> {
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: ids.filter((id): id is number => id !== null) } },
      select: { id: true, nombre: true, apellido: true },
    });

    return new Map(
      usuarios.map(({ id, nombre, apellido }) => [
        id,
        `${nombre} ${apellido}`.trim(),
      ]),
    );
  }
}

/** La cuota cobrada en el mesón: pagada, y no por Webpay (asunción 2). */
const CUOTA_DEL_MESON = {
  estado: EstadoCuota.PAGADA,
  medio: { in: [MedioPago.EFECTIVO, MedioPago.TRANSFERENCIA] },
};

/** La inscripción cobrada en el mesón: pagada por transferencia o en efectivo. */
const INSCRIPCION_DEL_MESON = {
  estadoPago: EstadoPagoInscripcion.PAGADA,
  medioPago: {
    in: [MedioPagoInscripcion.TRANSFERENCIA, MedioPagoInscripcion.EFECTIVO],
  },
};

const SELECT_CUOTA = {
  id: true,
  tipo: true,
  periodo: true,
  montoClp: true,
  descuentoClp: true,
  medio: true,
  pagadaEn: true,
  registradaPor: true,
  socio: {
    select: { usuario: { select: { id: true, nombre: true, apellido: true } } },
  },
} as const;

const SELECT_INSCRIPCION = {
  id: true,
  torneoId: true,
  medioPago: true,
  inscritaEn: true,
  torneo: { select: { nombre: true } },
  torneoCategoria: {
    select: {
      montoInscripcionClp: true,
      categoriaJuego: { select: { nombre: true } },
    },
  },
  jugador: { select: { nombre: true, apellido: true, socioId: true } },
} as const;

interface CuotaDeLaLista {
  id: number;
  tipo: TipoCuota;
  periodo: string;
  montoClp: number;
  descuentoClp: number;
  medio: MedioPago | null;
  pagadaEn: Date | null;
  registradaPor: number | null;
  socio: { usuario: { id: number; nombre: string; apellido: string } };
}

interface InscripcionDeLaLista {
  id: number;
  torneoId: number;
  medioPago: MedioPagoInscripcion | null;
  inscritaEn: Date;
  torneo: { nombre: string };
  torneoCategoria: {
    montoInscripcionClp: number;
    categoriaJuego: { nombre: string };
  };
  jugador: { nombre: string; apellido: string; socioId: number | null };
}

function describirCuota(cuota: CuotaDeLaLista) {
  const { usuario } = cuota.socio;
  const detalle =
    cuota.tipo === TipoCuota.INCORPORACION
      ? 'Cuota de incorporación'
      : `Cuota ${mesYAnio(cuota.periodo)}`;

  return {
    detalle,
    quien: `${usuario.nombre} ${usuario.apellido}`.trim(),
    esSocio: true,
    asociado: {
      tipo: 'CUOTA' as const,
      id: cuota.id,
      texto: detalle,
      enlace: `/administracion/personas/${usuario.id}`,
    },
  };
}

function describirInscripcion(inscripcion: InscripcionDeLaLista) {
  const detalle =
    `Inscripción · ${inscripcion.torneo.nombre} · ` +
    inscripcion.torneoCategoria.categoriaJuego.nombre;

  return {
    detalle,
    quien:
      `${inscripcion.jugador.nombre} ${inscripcion.jugador.apellido}`.trim(),
    esSocio: inscripcion.jugador.socioId !== null,
    asociado: {
      tipo: 'INSCRIPCION' as const,
      id: inscripcion.id,
      texto: detalle,
      enlace: `/administracion/torneos/${inscripcion.torneoId}`,
    },
  };
}

function filaDeWebpay(
  transaccion: TransaccionDeLaLista,
  descripcion: Descripcion,
): FilaDePago {
  return {
    origen: 'webpay',
    id: transaccion.id,
    fecha: transaccion.confirmadaEn ?? transaccion.creadaEn,
    concepto: CONCEPTO_DE[transaccion.concepto],
    detalle: descripcion.detalle,
    quien: descripcion.quien,
    esSocio: descripcion.esSocio,
    medio: 'WEBPAY',
    tipoPago: transaccion.tipoPago,
    montoClp: transaccion.montoClp,
    estado: transaccion.estado,
    referencia: transaccion.referencia,
    codigoAutorizacion: transaccion.codigoAutorizacion,
    porRevisar: transaccion.requiereRevision && transaccion.revisadaEn === null,
  };
}

function filaDeCuota(cuota: CuotaDeLaLista): FilaDePago {
  const { detalle, quien, esSocio } = describirCuota(cuota);

  return {
    origen: 'cuota',
    id: cuota.id,
    fecha: cuota.pagadaEn!,
    concepto: 'CUOTA',
    detalle,
    quien,
    esSocio,
    medio:
      cuota.medio === MedioPago.TRANSFERENCIA ? 'TRANSFERENCIA' : 'EFECTIVO',
    tipoPago: null,
    montoClp: cuota.montoClp - cuota.descuentoClp,
    estado: 'MESON',
    referencia: null,
    codigoAutorizacion: null,
    porRevisar: false,
  };
}

function filaDeInscripcion(inscripcion: InscripcionDeLaLista): FilaDePago {
  const { detalle, quien, esSocio } = describirInscripcion(inscripcion);

  return {
    origen: 'inscripcion',
    id: inscripcion.id,
    // No se guarda cuándo se aprobó el comprobante (asunción 2, PQ2).
    fecha: inscripcion.inscritaEn,
    concepto: 'INSCRIPCION',
    detalle,
    quien,
    esSocio,
    medio:
      inscripcion.medioPago === MedioPagoInscripcion.EFECTIVO
        ? 'EFECTIVO'
        : 'TRANSFERENCIA',
    tipoPago: null,
    montoClp: inscripcion.torneoCategoria.montoInscripcionClp,
    estado: 'MESON',
    referencia: null,
    codigoAutorizacion: null,
    porRevisar: false,
  };
}

/** Por qué no se devuelve, para el 409 de «Devolver»; nulo si se puede. */
type CodigoDeDevolucion =
  'YA_DEVUELTO' | 'NO_AUTORIZADA' | 'FUERA_DE_PLAZO' | 'SIGUE_VIGENTE' | null;

type ReglaConCodigo = ReglaDeDevolucion & { codigo: CodigoDeDevolucion };

/**
 * Transbank anula por servicios web hasta 90 días desde la venta (PQ1, documentación de Webpay:
 * «Anulaciones y Reversas»). Antes de 3 horas es una reversa; después, una anulación: la decide
 * Transbank con el mismo servicio. La devolución total se puede con débito, prepago y crédito.
 */
const DIAS_PARA_DEVOLVER = 90;

const YA_DEVUELTO =
  'Este pago ya se devolvió. Vuelve a la ficha para ver quién lo hizo y por qué.';

/**
 * Lo pagado de una reserva sigue en pie mientras la reserva lo esté. Un `Record` y no una lista:
 * un estado nuevo no compila hasta que alguien decida si se puede devolver (revisión, T400).
 */
const RESERVA_VIGENTE: Record<EstadoReserva, boolean> = {
  PENDIENTE_PAGO: true,
  CONFIRMADA: true,
  CANCELADA: false,
  EXPIRADA: false,
};

/** La regla como la ve la ficha: el código es para el 409 de «Devolver». */
const sinCodigo = ({
  permitida,
  motivo,
  enlace,
}: ReglaConCodigo): ReglaDeDevolucion => ({
  permitida,
  motivo,
  enlace,
});

function devolucionDe(
  transaccion: TransaccionDeLaLista,
  descripcion: Descripcion,
  ahora = new Date(),
): ReglaConCodigo {
  const no = (
    codigo: CodigoDeDevolucion,
    motivo: string,
    enlace: string | null = null,
  ) => ({
    permitida: false,
    motivo,
    enlace,
    codigo,
  });

  if (transaccion.estado === EstadoTransaccion.ANULADA) {
    return no('YA_DEVUELTO', YA_DEVUELTO);
  }
  if (transaccion.estado !== EstadoTransaccion.AUTORIZADA) {
    return no('NO_AUTORIZADA', 'Solo se devuelve un pago autorizado.');
  }

  const venta = transaccion.confirmadaEn ?? transaccion.creadaEn;
  if (
    ahora.getTime() - venta.getTime() >
    DIAS_PARA_DEVOLVER * 24 * 60 * 60 * 1000
  ) {
    return no(
      'FUERA_DE_PLAZO',
      `Pasaron más de ${DIAS_PARA_DEVOLVER} días desde el pago, y Webpay solo devuelve dentro de ` +
        'ese plazo. Haz la devolución por transferencia, fuera del panel.',
    );
  }

  // Un pago marcado para revisión no dejó nada vigente: los caminos que lo marcan autorizado
  // —el monto que no cuadra, la diferencia de un cambio que no se aplicó (T90) y la inscripción
  // que ya estaba pagada o soltada— no aplican su efecto. Pedir cancelar la reserva o retirar la
  // inscripción le quitaría a alguien lo que sí pagó (revisión, T400).
  const queHacer = transaccion.requiereRevision
    ? null
    : descripcion.queHacerAntes(transaccion.id);
  return queHacer
    ? no('SIGUE_VIGENTE', queHacer.texto, queHacer.enlace)
    : { permitida: true, motivo: null, enlace: null, codigo: null };
}

const claveDe = ({
  concepto,
  conceptoId,
}: {
  concepto: ConceptoPago;
  conceptoId: number;
}) => `${concepto}:${conceptoId}`;

const suma = (filas: FilaDePago[]) =>
  filas.reduce((total, { montoClp }) => total + montoClp, 0);

/** Sin mayúsculas ni tildes: «Díaz» se encuentra escribiendo «diaz». */
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function diaSiguiente(fecha: string): string {
  const dia = new Date(`${fecha}T00:00:00.000Z`);
  dia.setUTCDate(dia.getUTCDate() + 1);
  return comoFechaCivil(dia);
}

const DIA_Y_HORA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** «vie 10 feb 10:00», en la hora del club. */
function diaYHora(instante: Date): string {
  const partes = Object.fromEntries(
    DIA_Y_HORA.formatToParts(instante).map(({ type, value }) => [type, value]),
  );
  const sinPunto = (texto: string) => texto.replace('.', '');

  return `${sinPunto(partes.weekday)} ${partes.day} ${sinPunto(partes.month)} ${partes.hour}:${partes.minute}`;
}

const MES_CORTO = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  month: 'short',
});

/** «feb 2039», del período AAAA-MM de la cuota. */
function mesYAnio(periodo: string): string {
  const mes = MES_CORTO.format(new Date(`${periodo}-15T12:00:00.000Z`)).replace(
    '.',
    '',
  );
  return `${mes} ${periodo.slice(0, 4)}`;
}

const FECHA_Y_HORA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_DEL_CLUB,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** «2039-02-05 12:00» en la hora del club: ordena bien en la planilla. */
function fechaYHoraDelClub(instante: Date): string {
  const partes = Object.fromEntries(
    FECHA_Y_HORA.formatToParts(instante).map(({ type, value }) => [
      type,
      value,
    ]),
  );
  return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}`;
}

const CONCEPTO_EN_PALABRAS: Record<ConceptoDelPago, string> = {
  RESERVA: 'Reserva',
  CUOTA: 'Cuota',
  INSCRIPCION: 'Inscripción',
};

const MEDIO_EN_PALABRAS: Record<MedioDelPago, string> = {
  WEBPAY: 'Webpay',
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
};

/** Los estados como los dice el club (asunción 5). */
const ESTADO_EN_PALABRAS: Record<EstadoDelPago, string> = {
  AUTORIZADA: 'Autorizado',
  PENDIENTE: 'Pendiente',
  RECHAZADA: 'Rechazado',
  ANULADA: 'Devuelto',
  EXPIRADA: 'Expirado',
  MESON: 'Pagado en el mesón',
};

/** Los tipos de pago de Webpay, en palabras. */
const TIPO_DE_PAGO: Record<string, string> = {
  VD: 'Débito',
  VN: 'Crédito',
  VC: 'Crédito en cuotas',
  SI: 'Cuotas sin interés',
  S2: 'Cuotas sin interés',
  NC: 'Cuotas sin interés',
  VP: 'Prepago',
};
