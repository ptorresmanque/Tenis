import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { hoyEnElClub } from '../comun/tiempo';
import {
  ConceptoPago,
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  EstadoTransaccion,
  type MedioPagoInscripcion,
} from '../generated/prisma/client';
import { ExpiracionService } from '../pagos/expiracion.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvisosDeTorneo } from './correos';
import { OCUPA_CUPO, porQueNoAcepta, tomarElCandado } from './cuadro-abierto';
import { vencimientoDeLaOferta } from './plazo-de-oferta';

/**
 * Lo que hay que leer de una inscripción y de su categoría para saber en qué está su oferta.
 */
export const PARA_LA_OFERTA = {
  estado: true,
  cupoOfrecidoHasta: true,
  torneoCategoria: {
    select: {
      semillaSorteo: true,
      categoriaJuego: { select: { nombre: true } },
      torneo: { select: { estado: true, cierreInscripcion: true } },
    },
  },
} as const;

type FilaDeLaOferta = {
  estado: EstadoInscripcionTorneo;
  cupoOfrecidoHasta: Date | null;
  torneoCategoria: Parameters<typeof porQueNoAcepta>[0];
};

/**
 * En qué está la inscripción de quien abre su llave (T332):
 *
 * - `OFRECIDO`: tiene un cupo guardado, vigente, en una categoría que todavía acepta.
 * - `VENCIDO`: se le pasó el plazo, o el cron ya la retiró por eso.
 * - `CERRADO`: la categoría se armó o cerró la inscripción con la oferta corriendo (E3).
 * - `ESPERANDO`: en la lista, sin oferta todavía.
 * - `INSCRITO` y `RETIRADO`: ya entró, o salió por otra razón.
 */
export type SituacionDeLaOferta =
  'OFRECIDO' | 'VENCIDO' | 'CERRADO' | 'ESPERANDO' | 'INSCRITO' | 'RETIRADO';

export function situacionDeLaOferta(
  fila: FilaDeLaOferta,
  ahora = new Date(),
): SituacionDeLaOferta {
  if (fila.estado === EstadoInscripcionTorneo.INSCRITA) return 'INSCRITO';
  // Retirada con oferta es la que no pagó a tiempo (E2): el motivo sale de ahí.
  if (fila.estado === EstadoInscripcionTorneo.RETIRADA) {
    return fila.cupoOfrecidoHasta ? 'VENCIDO' : 'RETIRADO';
  }
  if (!fila.cupoOfrecidoHasta) return 'ESPERANDO';
  if (fila.cupoOfrecidoHasta <= ahora) return 'VENCIDO';

  return porQueNoAcepta(fila.torneoCategoria) ? 'CERRADO' : 'OFRECIDO';
}

/**
 * Por qué no se puede pagar ni tomar esta inscripción por su llave, o nulo si se puede (T332).
 *
 * **En espera no se cobra**, y una oferta solo se paga mientras está vigente y la categoría
 * acepta: lo que se cobrara fuera de eso sería plata sin cupo, que el club tendría que devolver.
 * Por lo mismo, tampoco la que el club retiró. La que ya está dentro sigue las reglas de siempre.
 */
export function porQueNoSePuedeTomar(
  fila: FilaDeLaOferta,
  ahora = new Date(),
): string | null {
  switch (situacionDeLaOferta(fila, ahora)) {
    case 'ESPERANDO':
      return (
        'Estás en la lista de espera: no se cobra nada hasta que se abra un cupo para ti, ' +
        'y te avisamos por correo.'
      );
    case 'VENCIDO':
      return 'Se venció tu plazo para tomar el cupo, y pasó al siguiente de la lista de espera.';
    case 'CERRADO':
      return porQueNoAcepta(fila.torneoCategoria);
    // Retirada por el club sin pagar: cobrarle sería plata sin cupo.
    case 'RETIRADO':
      return 'Esa inscripción ya no está en el torneo. Llámanos si hay un error.';
    case 'OFRECIDO':
    case 'INSCRITO':
      return null;
  }
}

/** Una inscripción vista por su llave, sin nada de quién es: la llave no es una cuenta. */
export interface InscripcionPorLlave {
  torneoId: number;
  torneo: string;
  categoria: string;
  montoClp: number;
  situacion: SituacionDeLaOferta;
  /** Hasta cuándo se le guarda el cupo, si se le ofreció uno. */
  hasta: string | null;
}

/**
 * La lista de espera de un torneo (`SPEC-torneos.md` § Lista de espera sin cobro).
 *
 * **A quien espera no se le cobra.** Cuando se abre un cupo, se le ofrece al primero de la fila
 * con un plazo para tomarlo, y si no lo toma, pasa al siguiente. Revierte «promover es manual»:
 * el club sigue pudiendo promover a mano, para los casos especiales, pero ya no es la única forma
 * de entrar.
 */
@Injectable()
export class ListaDeEspera {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosDeTorneo,
    private readonly expiracion: ExpiracionService,
  ) {}

  /**
   * Pasa el turno de las ofertas vencidas (T335, E2 y E6): lo corre el cron cada 5 minutos,
   * `npm run lista-de-espera -w apps/api`. Responde cuántas retiró.
   *
   * La oferta vencida sale de la lista como `RETIRADA`, **con su `cupoOfrecidoHasta`**, que es el
   * motivo del retiro, y le llega «Se venció tu plazo». **Con un pago de Webpay en curso, espera**:
   * quitarle el cupo a quien está tecleando su tarjeta sería cobrarle por un lugar que ya no
   * tiene. La pasarela le da 15 minutos; después la transacción expira y el turno pasa en la
   * vuelta siguiente. Es la misma regla del barrido de `InscripcionesAbandonadas`.
   *
   * Al final ofrece los cupos de **toda** categoría abierta con gente esperando sin oferta, no
   * solo de las que acaba de vencer: así también repara el lugar que un retiro dejó libre si su
   * oferta no alcanzó a salir.
   */
  async vencerOfertas(ahora = new Date()): Promise<number> {
    const vencidas = await this.prisma.inscripcionTorneo.findMany({
      where: {
        estado: EstadoInscripcionTorneo.LISTA_ESPERA,
        cupoOfrecidoHasta: { lte: ahora },
      },
      select: { id: true },
    });

    let retiradas = 0;

    if (vencidas.length > 0) {
      // Primero se expira lo de `pagos` y después se lee, como en el barrido: al revés, la
      // transacción que acaba de vencer todavía figura pendiente y frena el turno una vuelta más.
      await this.expiracion.barrer(ahora);

      const pagando = await this.prisma.transaccion.findMany({
        where: {
          concepto: ConceptoPago.INSCRIPCION_TORNEO,
          conceptoId: { in: vencidas.map((una) => una.id) },
          estado: {
            in: [EstadoTransaccion.PENDIENTE, EstadoTransaccion.AUTORIZADA],
          },
        },
        select: { conceptoId: true },
      });
      const vivas = new Set(pagando.map((una) => una.conceptoId));

      for (const { id } of vencidas.filter((una) => !vivas.has(una.id))) {
        // El estado y el plazo en el `where`: si entre medio la tomó o el admin la promovió, no
        // se la retira.
        const { count } = await this.prisma.inscripcionTorneo.updateMany({
          where: {
            id,
            estado: EstadoInscripcionTorneo.LISTA_ESPERA,
            cupoOfrecidoHasta: { lte: ahora },
          },
          data: { estado: EstadoInscripcionTorneo.RETIRADA, siembra: null },
        });

        if (count > 0) {
          retiradas += 1;
          await this.avisos.ofertaVencida(id);
        }
      }
    }

    // Toda categoría con gente esperando sin oferta, y con la inscripción abierta: el filtro por
    // fecha deja fuera los torneos viejos, y `ofrecerCupos` revisa el resto bajo el candado.
    const conFila = await this.prisma.inscripcionTorneo.findMany({
      where: {
        estado: EstadoInscripcionTorneo.LISTA_ESPERA,
        cupoOfrecidoHasta: null,
        torneo: { cierreInscripcion: { gte: hoyEnElClub(ahora) } },
      },
      distinct: ['torneoCategoriaId'],
      select: { torneoCategoriaId: true },
    });

    for (const { torneoCategoriaId } of conFila) {
      await this.ofrecerCupos(torneoCategoriaId);
    }

    return retiradas;
  }

  /**
   * La inscripción de una llave, para la página de la oferta (T332). La llave viaja en el
   * correo «Se abrió un cupo»: es lo único con que quien no tiene cuenta vuelve a ella.
   */
  async porLlave(token: string): Promise<InscripcionPorLlave> {
    const fila = await this.prisma.inscripcionTorneo.findUnique({
      where: { token },
      select: {
        ...PARA_LA_OFERTA,
        torneoId: true,
        torneo: { select: { nombre: true } },
        torneoCategoria: {
          select: {
            ...PARA_LA_OFERTA.torneoCategoria.select,
            montoInscripcionClp: true,
          },
        },
      },
    });

    // El mismo 404 que el resto de los caminos por llave: quien prueba llaves ajenas no se
    // entera de si acertó el formato.
    if (!fila) {
      throw new NotFoundException('No hay una inscripción con esa llave.');
    }

    return {
      torneoId: fila.torneoId,
      torneo: fila.torneo.nombre,
      categoria: fila.torneoCategoria.categoriaJuego.nombre,
      montoClp: fila.torneoCategoria.montoInscripcionClp,
      situacion: situacionDeLaOferta(fila),
      hasta: fila.cupoOfrecidoHasta?.toISOString() ?? null,
    };
  }

  /**
   * Toma la oferta: la deja dentro del cuadro, sin oferta y con lo que trajo (T333).
   *
   * **Con el candado y volviendo a mirar la oferta**: el cron puede haberla vencido, o el admin
   * armado el cuadro, entre que la persona abrió la página y apretó el botón. Lo que se mira
   * antes, afuera, es solo para no procesar una imagen en vano.
   *
   * Le llega «Inscripción recibida», como a cualquiera que se inscribe sin Webpay.
   */
  async tomar(
    id: number,
    datos: { medioPago?: MedioPagoInscripcion; comprobanteRuta?: string } = {},
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { torneoCategoriaId } =
        await tx.inscripcionTorneo.findUniqueOrThrow({
          where: { id },
          select: { torneoCategoriaId: true },
        });
      await tomarElCandado(tx, torneoCategoriaId);

      const fila = await tx.inscripcionTorneo.findUniqueOrThrow({
        where: { id },
        select: PARA_LA_OFERTA,
      });
      if (situacionDeLaOferta(fila) !== 'OFRECIDO') {
        throw new ConflictException(
          porQueNoSePuedeTomar(fila) ?? 'Ya estás dentro del cuadro.',
        );
      }

      await tx.inscripcionTorneo.update({
        where: { id },
        data: {
          estado: EstadoInscripcionTorneo.INSCRITA,
          cupoOfrecidoHasta: null,
          ...datos,
        },
      });
    });

    await this.avisos.inscripcionRecibida(id);
  }

  /** Toma la oferta de una categoría gratis, con el botón de su página (T333, E5). */
  async tomarGratis(token: string): Promise<{ id: number }> {
    const fila = await this.prisma.inscripcionTorneo.findUnique({
      where: { token },
      select: { id: true, estadoPago: true },
    });

    if (!fila) {
      throw new NotFoundException('No hay una inscripción con esa llave.');
    }

    if (fila.estadoPago !== EstadoPagoInscripcion.EXENTA) {
      throw new ConflictException(
        'Esta categoría se paga: toma el cupo pagando con Webpay o subiendo el comprobante.',
      );
    }

    await this.tomar(fila.id);

    return { id: fila.id };
  }

  /**
   * Les da los cupos libres de una categoría a los primeros de su fila, por orden de llegada
   * (T329).
   *
   * **Una oferta ocupa su lugar hasta que se toma o se retira**, haya vencido o no: ver
   * `OCUPA_CUPO`.
   *
   * **Quien ya pagó entra directo** (E4): antes de este cambio la lista de espera pagaba al
   * inscribirse, y ofrecerle el cupo sería pedirle que pague dos veces.
   *
   * **Con el candado de la categoría**, el mismo de inscribirse: sin él, dos lugares que se
   * liberan a la vez cuentan el mismo hueco y se lo ofrecen a dos personas.
   *
   * Con la inscripción cerrada o el cuadro armado no ofrece nada (E3). Los correos salen al
   * final, con todo escrito: un envío que falla no deshace una oferta.
   */
  async ofrecerCupos(torneoCategoriaId: number): Promise<void> {
    const turnos = await this.prisma.$transaction(async (tx) => {
      await tomarElCandado(tx, torneoCategoriaId);

      const cuadro = await tx.torneoCategoria.findUnique({
        where: { id: torneoCategoriaId },
        select: {
          cupo: true,
          semillaSorteo: true,
          categoriaJuego: { select: { nombre: true } },
          torneo: { select: { estado: true, cierreInscripcion: true } },
        },
      });
      if (!cuadro || porQueNoAcepta(cuadro) !== null) return [];

      const ocupados = await tx.inscripcionTorneo.count({
        where: { torneoCategoriaId, ...OCUPA_CUPO },
      });
      if (ocupados >= cuadro.cupo) return [];

      const fila = await tx.inscripcionTorneo.findMany({
        where: {
          torneoCategoriaId,
          estado: EstadoInscripcionTorneo.LISTA_ESPERA,
          cupoOfrecidoHasta: null,
        },
        orderBy: [{ inscritaEn: 'asc' }, { id: 'asc' }],
        take: cuadro.cupo - ocupados,
        select: { id: true, estadoPago: true, comprobanteRuta: true },
      });
      if (fila.length === 0) return [];

      // El plazo vigente al darse la oferta (E1): cambiarlo después no mueve las que corren.
      const { plazoCupoListaEsperaMin } =
        await tx.configuracionClub.findFirstOrThrow({
          select: { plazoCupoListaEsperaMin: true },
        });
      const hasta = vencimientoDeLaOferta(
        new Date(),
        plazoCupoListaEsperaMin,
        cuadro.torneo.cierreInscripcion,
      );

      const hechos: { id: number; yaPago: boolean }[] = [];
      for (const turno of fila) {
        const yaPago =
          turno.estadoPago === EstadoPagoInscripcion.PAGADA ||
          turno.comprobanteRuta !== null;

        await tx.inscripcionTorneo.update({
          where: { id: turno.id },
          data: yaPago
            ? { estado: EstadoInscripcionTorneo.INSCRITA }
            : { cupoOfrecidoHasta: hasta },
        });
        hechos.push({ id: turno.id, yaPago });
      }

      return hechos;
    });

    for (const { id, yaPago } of turnos) {
      if (yaPago) await this.avisos.quedasteDentro(id);
      else await this.avisos.cupoOfrecido(id);
    }
  }
}
