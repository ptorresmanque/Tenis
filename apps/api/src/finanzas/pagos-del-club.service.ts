import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  comoFechaCivil,
  esFechaDelClub,
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
import { AnulacionService } from '../pagos/anulacion.service';
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

const CONCEPTOS: ConceptoDelPago[] = ['RESERVA', 'CUOTA', 'INSCRIPCION'];
const ESTADOS: EstadoDelPago[] = [...Object.values(EstadoTransaccion), 'MESON'];
const MEDIOS: MedioDelPago[] = ['WEBPAY', 'EFECTIVO', 'TRANSFERENCIA'];
const ORIGENES: OrigenDelPago[] = ['webpay', 'cuota', 'inscripcion'];

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
  /** Si lo pagado sigue vigente para esta transacción, qué hacer antes de devolverla. */
  queHacerAntes: (transaccionId: number) => string | null;
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
   * Si un pago por Webpay se puede devolver (asunción 9): solo autorizado, y solo si lo pagado ya
   * no está vigente. La comparte la ficha con «Devolver» (T397).
   */
  async reglaDeDevolucion(transaccionId: number): Promise<ReglaDeDevolucion> {
    return sinCodigo(await this.reglaConCodigo(transaccionId));
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

    try {
      await this.anulacion.anular(transaccionId, { por, motivo });
    } catch (error) {
      // El rechazo de la pasarela, tal cual: el admin decide con eso, y el pago sigue autorizado.
      throw new BadGatewayException({
        motivo: 'LA_PASARELA_NO_DEVOLVIO',
        message: `La pasarela no hizo la devolución: ${error instanceof Error ? error.message : String(error)}`,
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
        message: 'Este pago ya se revisó.',
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
      const vigente =
        reserva.estado === EstadoReserva.CONFIRMADA ||
        reserva.estado === EstadoReserva.PENDIENTE_PAGO;

      mapa.set(`${ConceptoPago.RESERVA}:${reserva.id}`, {
        detalle,
        quien: reserva.nombre,
        esSocio: reserva.socioId !== null,
        asociado: { tipo: 'RESERVA', id: reserva.id, texto: detalle, enlace },
        queHacerAntes: () =>
          vigente
            ? 'Primero cancela la reserva desde la agenda: todavía está vigente.'
            : null,
      });
    }

    for (const cuota of cuotas) {
      const base = describirCuota(cuota);
      mapa.set(`${ConceptoPago.CUOTA}:${cuota.id}`, {
        ...base,
        // Vigente si sigue pagada con este cobro. Anulada, o pagada con otro (un pago
        // duplicado), ya no.
        queHacerAntes: (transaccionId) =>
          cuota.estado === EstadoCuota.PAGADA &&
          cuota.transaccionId === transaccionId
            ? 'Primero anula la cuota desde la ficha de la persona: sigue pagada con este cobro.'
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
            ? 'Primero retira la inscripción desde el torneo: todavía está vigente.'
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
    return no('YA_DEVUELTO', 'Ya se devolvió.');
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
      `Transbank devuelve por Webpay hasta ${DIAS_PARA_DEVOLVER} días después del pago, y este ya ` +
        'los pasó: la devolución se hace por transferencia, fuera del panel.',
    );
  }

  const queHacer = descripcion.queHacerAntes(transaccion.id);
  return queHacer
    ? no('SIGUE_VIGENTE', queHacer, descripcion.asociado.enlace)
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

/**
 * Lee el filtro de la consulta, con los valores por omisión a la vista (el mes en curso). Un valor
 * que no existe responde 400: una lista vacía parecería la verdad.
 */
export function leerFiltro(consulta: Record<string, unknown>): FiltroDePagos {
  const hoy = comoFechaCivil(hoyEnElClub());
  const desde = texto(consulta['desde']) || `${hoy.slice(0, 7)}-01`;
  const hasta = texto(consulta['hasta']) || ultimoDiaDelMes(hoy);
  if (!esFechaDelClub(desde) || !esFechaDelClub(hasta) || desde > hasta) {
    throw new BadRequestException(
      'Las fechas tienen que existir, con la forma AAAA-MM-DD, y «desde» no puede ir después de «hasta».',
    );
  }

  const conceptos = valores(consulta['concepto']);
  const estado = texto(consulta['estado']) || null;
  const medio = texto(consulta['medio']) || null;
  const orden = texto(consulta['orden']) || 'fecha';
  const direccion = texto(consulta['direccion']) || 'desc';

  if (
    conceptos.some((uno) => !CONCEPTOS.includes(uno as ConceptoDelPago)) ||
    (estado !== null && !ESTADOS.includes(estado as EstadoDelPago)) ||
    (medio !== null && !MEDIOS.includes(medio as MedioDelPago)) ||
    !['fecha', 'monto'].includes(orden) ||
    !['asc', 'desc'].includes(direccion)
  ) {
    throw new BadRequestException('Ese filtro no existe.');
  }

  return {
    desde,
    hasta,
    conceptos: conceptos as ConceptoDelPago[],
    estado: estado as EstadoDelPago | null,
    medio: medio as MedioDelPago | null,
    q: texto(consulta['q']).slice(0, 100),
    porRevisar: texto(consulta['porRevisar']) === 'true',
    orden: orden as FiltroDePagos['orden'],
    direccion: direccion as FiltroDePagos['direccion'],
  };
}

export function leerPagina(valor: unknown): number {
  const pagina = valor === undefined ? 1 : Number(valor);
  if (!Number.isInteger(pagina) || pagina < 1) {
    throw new BadRequestException('La página es un número desde 1.');
  }
  return pagina;
}

export function leerOrigen(valor: string): OrigenDelPago {
  if (!ORIGENES.includes(valor as OrigenDelPago)) {
    throw new BadRequestException('Ese origen de pago no existe.');
  }
  return valor as OrigenDelPago;
}

/**
 * La nota de la revisión o el motivo de la devolución, del cuerpo: obligatorio y de hasta 200
 * caracteres, el largo de su columna.
 */
export function leerTextoObligatorio(
  cuerpo: unknown,
  campo: 'nota' | 'motivo',
): string {
  const valor =
    typeof cuerpo === 'object' && cuerpo !== null
      ? texto((cuerpo as Record<string, unknown>)[campo]).trim()
      : '';
  if (valor === '' || valor.length > 200) {
    throw new BadRequestException(
      `${campo === 'nota' ? 'La nota' : 'El motivo'} es obligatorio y tiene hasta 200 caracteres.`,
    );
  }
  return valor;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

/** `?concepto=A,B` y `?concepto=A&concepto=B` dicen lo mismo. */
function valores(valor: unknown): string[] {
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista
    .flatMap((uno) => texto(uno).split(','))
    .map((uno) => uno.trim())
    .filter(Boolean);
}

function ultimoDiaDelMes(fecha: string): string {
  const [anio, mes] = fecha.split('-').map(Number);
  return comoFechaCivil(new Date(Date.UTC(anio, mes, 0)));
}
