import { Injectable } from '@nestjs/common';

import {
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvisosDeTorneo } from './correos';
import { OCUPA_CUPO, porQueNoAcepta, tomarElCandado } from './cuadro-abierto';
import { vencimientoDeLaOferta } from './plazo-de-oferta';

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
  ) {}

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
