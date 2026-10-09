import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { borrarImagen, guardarImagen } from '../comun/imagenes';
import { hoyEnElClub } from '../comun/tiempo';
import {
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  EstadoTorneo,
  MedioPagoInscripcion,
  type Prisma,
} from '../generated/prisma/client';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import type {
  InscripcionDeSocio,
  InscripcionPublica,
  MedioPago,
} from './inscripcion-publica.dto';
import type { Franja } from './restricciones';
import { InscripcionesAbandonadas } from './inscripciones-abandonadas.service';
import { Jugadores } from './jugadores.service';

/** Una inscripción, como se lee en la lista del torneo. */
export interface InscripcionPublicada {
  id: number;
  jugadorId: number;
  jugador: string;
  numeroSocio: string | null;
  procedencia: string | null;
  siembra: number | null;
  estado: EstadoInscripcionTorneo;
  inscritaEn: Date;
  /**
   * Cómo va su pago, **en la misma fila que su nombre**.
   *
   * Vivía solo en la bandeja de pagos, y esa separación era el problema: mirando a un
   * inscrito no se sabía si había pagado, y mirando la bandeja no se sabía en qué
   * cuadro estaba.
   */
  estadoPago: EstadoPagoInscripcion;
  /** Qué dijo que iba a hacer. Nulo si es gratis o lo anotó el admin. */
  medioPago: MedioPagoInscripcion | null;
  /**
   * Si hay un comprobante que mirar. **Un booleano y no la ruta**: la ruta es del
   * disco del servidor y la imagen se pide por su endpoint, detrás del guard.
   *
   * Es lo que separa "subió algo y espera que lo revises" de "eligió Webpay y todavía
   * no paga", que en la base son el mismo `PENDIENTE` y para el club son dos cosas
   * distintas: una es trabajo suyo y la otra se resuelve sola.
   */
  tieneComprobante: boolean;
  /**
   * A quién llamar si el comprobante no cuadra.
   *
   * Va en la lista del panel y **no** en la pública, como las restricciones: es el
   * mismo criterio de la bandeja de pagos, donde ya estaba por esta misma razón.
   */
  telefono: string | null;
  /**
   * A dónde escribirle (T127). Del panel y no de la pública, por la misma razón que el
   * teléfono. Nulo en las de antes de T127 y en las que el admin anotó sin uno.
   */
  email: string | null;
  /**
   * Cuándo **no** puede jugar.
   *
   * Va en la lista del panel y **no** en la pública: dice a qué hora esa persona no
   * está en su casa. Es el mismo criterio que el teléfono — `TorneosPublicos` arma sus
   * propias formas justamente para que un campo de acá no salga a la calle porque
   * alguien lo agregó sin pensarlo.
   */
  restricciones: { diaSemana: number; horaDesde: string; horaHasta: string }[];
}

/** Lo que responde quien se inscribe solo: la calle o el socio. */
export interface InscripcionHecha {
  id: number;
  estado: EstadoInscripcionTorneo;
  estadoPago: EstadoPagoInscripcion;
  /**
   * **Su llave.** Es lo único con que quien no tiene cuenta vuelve a su inscripción
   * para pagarla o subir el comprobante; sin ella el id alcanzaría, y los ids son
   * correlativos. Se devuelve una vez y la pantalla la guarda.
   */
  token: string;
  montoClp: number;
  categoria: string;
  jugador: string;
}

/** La lista de **un cuadro**: el cupo y las tres listas son suyos, no del torneo. */
export interface ListaDelCuadro {
  torneoId: number;
  torneoCategoriaId: number;
  categoria: string;
  cupo: number;
  /** Cuánto cuesta este cuadro. Del cuadro y no de cada fila: es el mismo para todos. */
  montoClp: number;
  estado: EstadoTorneo;
  inscritos: InscripcionPublicada[];
  enEspera: InscripcionPublicada[];
  retirados: InscripcionPublicada[];
}

/**
 * Quién juega cada torneo.
 *
 * **Pasado el cupo se entra en lista de espera, no se rechaza.** Rechazar obligaría al
 * club a llevar la lista en un papel, que es de donde venimos. Y **promover es manual**:
 * el club llama por teléfono antes de meter a alguien en un cuadro que ya anunció.
 *
 * **El socio moroso puede inscribirse.** Es deliberado y va en contra del instinto: la
 * regla de morosidad que existe hoy es sobre reservar canchas, y extenderla a los
 * torneos es una decisión de club que nadie tomó. Si el club la quiere, es una
 * comprobación en este archivo.
 */
@Injectable()
export class InscripcionesATorneo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jugadores: Jugadores,
    private readonly abandonadas: InscripcionesAbandonadas,
  ) {}

  /**
   * Inscribe a un jugador, o al socio por su ficha.
   *
   * El cupo se cuenta **después** de tomar la fila del torneo como cerrojo: sin él,
   * dos inscripciones simultáneas al último lugar cuentan las dos lo mismo, las dos
   * ven sitio y el cuadro se arma con un jugador de más.
   */
  async inscribir(
    torneoCategoriaId: number,
    quien: { jugadorId?: number; socioId?: number; email: string | null },
  ): Promise<{
    id: number;
    estado: EstadoInscripcionTorneo;
    estadoPago: EstadoPagoInscripcion;
    token: string;
  }> {
    return this.anotar(
      torneoCategoriaId,
      async (tx) =>
        quien.jugadorId !== undefined
          ? quien.jugadorId
          : (await this.jugadores.deSocio(quien.socioId as number, tx)).id,
      { email: quien.email },
    );
  }

  /**
   * El cuerpo de la inscripción, con **el jugador resuelto dentro del cerrojo**.
   *
   * Que el jugador se resuelva acá adentro y no antes es lo que impide que una
   * inscripción rechazada deje datos escritos. Con la resolución afuera, pedir plaza en
   * un torneo cerrado creaba igual el jugador —y, cuando ya existía, le reescribía el
   * nombre—: en el endpoint público eso era vandalismo a distancia. Lo destapó la
   * revisión de T64 con una sonda.
   */
  private async anotar(
    torneoCategoriaId: number,
    resolverJugador: (tx: Prisma.TransactionClient) => Promise<number>,
    {
      restricciones = [],
      comprobanteRuta = null,
      medioPago = null,
      email,
    }: {
      restricciones?: Franja[];
      comprobanteRuta?: string | null;
      medioPago?: MedioPago | null;
      email: string | null;
    },
  ): Promise<{
    id: number;
    estado: EstadoInscripcionTorneo;
    estadoPago: EstadoPagoInscripcion;
    token: string;
  }> {
    // **Antes de contar el cupo, y no después.** Los lugares de quienes eligieron
    // Webpay y cerraron la ventana de pago tienen que estar sueltos cuando se decide
    // si esta inscripción entra al cuadro o a la lista de espera; si no, el cuadro se
    // llena con gente que no pagó y el que sí paga queda esperando.
    await this.abandonadas.liberar({ torneoCategoriaId });

    return this.prisma.$transaction(async (tx) => {
      const cuadro = await this.tomarElCuadro(tx, torneoCategoriaId);
      const jugadorId = await resolverJugador(tx);

      // **En el torneo, no en el cuadro.** Un jugador se inscribe en una sola
      // categoría por torneo (`SPEC-torneos.md` § Un torneo, varios cuadros): el que
      // juega 4ª y Honor el mismo fin de semana tiene dos partidos a la misma hora y
      // alguien pierde por walkover. Lo respalda el único `(torneoId, jugadorActivo)`.
      const suya = await this.yaEsta(tx, cuadro.torneoId, jugadorId);

      if (suya) {
        // **Con nombre y apellidos.** Sin ellos, quien inscribe a su hijo lee "ya
        // estás inscrito" y no tiene cómo saber a quién se refiere el sistema; era la
        // otra mitad del problema del teléfono compartido.
        throw new ConflictException(
          `${suya} ya está inscrito en una categoría de este torneo.`,
        );
      }

      const [tomados, esperando] = await Promise.all([
        tx.inscripcionTorneo.count({
          where: {
            torneoCategoriaId,
            estado: EstadoInscripcionTorneo.INSCRITA,
          },
        }),
        tx.inscripcionTorneo.count({
          where: {
            torneoCategoriaId,
            estado: EstadoInscripcionTorneo.LISTA_ESPERA,
          },
        }),
      ]);

      try {
        return await tx.inscripcionTorneo.create({
          data: {
            torneoId: cuadro.torneoId,
            torneoCategoriaId,
            jugadorId,
            // **Con gente esperando, el que llega va al final de la fila aunque haya
            // lugar.** Un lugar que se libera es de quien lleva dos semanas esperando,
            // no del que se inscribió después; si no, la lista de espera deja de ser
            // una fila y el club queda explicándole a alguien por qué lo pasaron.
            estado:
              tomados < cuadro.cupo && esperando === 0
                ? EstadoInscripcionTorneo.INSCRITA
                : EstadoInscripcionTorneo.LISTA_ESPERA,
            // **El estado de pago sale del monto del cuadro, no del cliente.** Cero es
            // gratis y no pasa por `pagos`; con monto, nace `PENDIENTE` y ocupa cupo
            // hasta que el admin lo rechace: al revés, el cupo se llenaría por orden de
            // rapidez del banco y no por orden de llegada.
            estadoPago:
              cuadro.montoClp > 0
                ? EstadoPagoInscripcion.PENDIENTE
                : EstadoPagoInscripcion.EXENTA,
            // **La transferencia entra en la misma escritura que la inscripción.** El
            // comprobante dejó de ser un segundo paso opcional: sin él no hay
            // inscripción, así que tampoco hay una fila esperándolo.
            comprobanteRuta,
            // Qué dijo que iba a hacer. Es lo que después permite soltarle el cupo al
            // que eligió Webpay y cerró la ventana, sin tocar al que el admin anotó
            // para que pague en efectivo — ver `InscripcionesAbandonadas`.
            medioPago,
            email,
            // En la misma escritura que la inscripción: unas franjas sin inscripción no
            // significan nada, y una inscripción sin ellas mandaría a T67 a programar
            // un partido a una hora que la persona ya dijo que no podía.
            restricciones: { create: restricciones },
          },
          select: { id: true, estado: true, estadoPago: true, token: true },
        });
      } catch (falla) {
        // **El único `(torneoId, jugadorActivo)` es la última palabra, y hay una
        // carrera que solo él ataja.** El cerrojo es sobre el cuadro —serializar por
        // torneo pondría a los de Honor en fila detrás de los de la 4ª sin razón—,
        // pero la comprobación de "ya está inscrito" abarca el torneo entero. Dos
        // inscripciones simultáneas del mismo jugador en dos categorías toman filas
        // distintas, las dos pasan la comprobación, y la base atrapa una.
        //
        // Sin este `catch` eso sale como un 500. Es el mismo criterio de T2, T21 y
        // T18: una carrera se lee como "alguien se te adelantó", no como una caída.
        if (esViolacionDeUnicidad(falla)) {
          throw new ConflictException(
            'Ese jugador ya está inscrito en una categoría de este torneo.',
          );
        }

        throw falla;
      }
    });
  }

  /**
   * Inscribe a alguien que se anotó **solo, desde la calle y sin cuenta**.
   *
   * Revierte "inscribirse sigue siendo cosa del admin" (`SPEC-torneos.md` § Cuatro
   * decisiones que el club revirtió). Se abre sin sesión porque el torneo lo juegan
   * externos de otros clubes que no tienen ni van a tener cuenta acá.
   *
   * **La categoría se resuelve contra las que corre ese torneo**, no se acepta como
   * viene: que el servidor busque el par `(torneo, categoría)` es lo que impide
   * inscribirse en una categoría que ese torneo no juega. Todo lo demás —el estado, la
   * fecha de cierre, el cupo— lo comprueba `inscribir`, que es el mismo camino que usa
   * el admin: **una sola puerta y no dos que puedan divergir**.
   */
  async inscribirDesdeLaCalle(
    torneoId: number,
    datos: InscripcionPublica,
    comprobante?: Buffer,
  ): Promise<InscripcionHecha> {
    return this.inscribirConPago(
      torneoId,
      datos,
      (tx) => this.jugadores.porTelefono(tx, datos),
      comprobante,
    );
  }

  /**
   * El socio se inscribe **sin el formulario** (T129, punto 5 de la sexta parte).
   *
   * Elige la categoría, dice cuándo no puede jugar y **paga igual** que cualquiera
   * (decisión 5). El resto sale de su sesión y nunca del cuerpo: el jugador es el de su
   * ficha —vinculado al externo que ya fue, si jugó antes desde la calle— y el correo
   * es el de su cuenta.
   */
  async inscribirAlSocio(
    torneoId: number,
    socio: { socioId: number; email: string },
    datos: InscripcionDeSocio,
    comprobante?: Buffer,
  ): Promise<InscripcionHecha> {
    return this.inscribirConPago(
      torneoId,
      { ...datos, email: socio.email },
      (tx) => this.jugadores.deSocio(socio.socioId, tx),
      comprobante,
    );
  }

  /**
   * Lo que comparten la calle y el socio: el cuadro, el pago y el comprobante.
   *
   * **La categoría se resuelve contra las que corre ese torneo** y el monto sale de la
   * base; el jugador lo resuelve quien llama, dentro del cerrojo de `anotar`.
   */
  private async inscribirConPago(
    torneoId: number,
    datos: InscripcionDeSocio & { email: string },
    resolverJugador: (
      tx: Prisma.TransactionClient,
    ) => Promise<{ id: number; nombre: string; apellido: string }>,
    comprobante?: Buffer,
  ): Promise<InscripcionHecha> {
    const cuadro = await this.prisma.torneoCategoria.findUnique({
      where: {
        torneoId_categoriaJuegoId: {
          torneoId,
          categoriaJuegoId: datos.categoriaJuegoId,
        },
      },
      select: {
        id: true,
        montoInscripcionClp: true,
        categoriaJuego: { select: { nombre: true } },
      },
    });

    if (!cuadro) {
      throw new NotFoundException(
        'Ese torneo no corre esa categoría. Elige una de las que aparecen.',
      );
    }

    // **Lo que cobra el cuadro decide qué se exige, y el monto sale de la base.** Un
    // cuadro gratis no pregunta nada; uno con monto no acepta una inscripción que no
    // venga con su forma de pago resuelta.
    const ruta =
      cuadro.montoInscripcionClp > 0
        ? await this.exigirElPago(datos.medioPago, comprobante)
        : null;

    // El jugador se crea **dentro** de la misma transacción y después de que el
    // cuadro pasó sus comprobaciones: una inscripción rechazada no deja nada escrito.
    let quien = '';

    try {
      const inscripcion = await this.anotar(
        cuadro.id,
        async (tx) => {
          const jugador = await resolverJugador(tx);
          quien = `${jugador.nombre} ${jugador.apellido}`;

          return jugador.id;
        },
        {
          restricciones: datos.restricciones,
          comprobanteRuta: ruta,
          // Solo si el cuadro cobra: en uno gratis no eligió nada y la inscripción ya
          // está completa, así que no hay cupo que soltarle después.
          medioPago: cuadro.montoInscripcionClp > 0 ? datos.medioPago : null,
          email: datos.email,
        },
      );

      return {
        ...inscripcion,
        montoClp: cuadro.montoInscripcionClp,
        categoria: cuadro.categoriaJuego.nombre,
        jugador: quien,
      };
    } catch (falla) {
      // La imagen ya está en el disco y la inscripción no existe: sin este barrido,
      // cada intento contra un torneo cerrado dejaría un archivo huérfano, y la
      // inscripción desde la calle no pide sesión.
      if (ruta) await borrarImagen(ruta);

      throw falla;
    }
  }

  /**
   * Que la inscripción venga pagada o con su comprobante, **antes de escribir nada**.
   *
   * Es el arreglo de lo que el club encontró: la inscripción se creaba igual y el pago
   * quedaba en un panel que se podía cerrar, así que el cupo se llenaba con gente que
   * nunca pagó. Ver `SPEC-torneos.md` § El pago no es un segundo paso.
   *
   * Con Webpay no hay nada que adjuntar —la persona sigue a la pasarela con el token
   * que devuelve la inscripción—; con transferencia, la imagen viaja en este mismo
   * envío o no hay inscripción.
   *
   * **La imagen se procesa antes de la transacción y no dentro**: `sharp` decodifica
   * hasta 15 MB, y hacerlo con el cerrojo del cuadro tomado pondría en fila a todos los
   * que se inscriben mientras tanto.
   */
  private async exigirElPago(
    medioPago: MedioPago | null,
    comprobante?: Buffer,
  ): Promise<string | null> {
    if (medioPago === null) {
      throw new BadRequestException(
        'Elige cómo vas a pagar la inscripción: con Webpay o transfiriendo.',
      );
    }

    if (medioPago === 'WEBPAY') return null;

    if (!comprobante) {
      throw new BadRequestException(
        'Adjunta la imagen de tu transferencia: sin el comprobante la inscripción ' +
          'no queda tomada.',
      );
    }

    return (await guardarImagen(comprobante, 'comprobantes')).ruta;
  }

  /**
   * Baja a alguien del torneo.
   *
   * **El primero de la lista de espera no entra solo.** Es la decisión de
   * `SPEC-torneos.md`: el club llama antes de meter a alguien en un cuadro, porque
   * quien quedó fuera hace dos semanas ya hizo otros planes.
   */
  async retirar(
    torneoCategoriaId: number,
    id: number,
  ): Promise<{ id: number }> {
    const { count } = await this.prisma.inscripcionTorneo.updateMany({
      where: {
        id,
        torneoCategoriaId,
        estado: { not: EstadoInscripcionTorneo.RETIRADA },
      },
      data: { estado: EstadoInscripcionTorneo.RETIRADA, siembra: null },
    });

    if (count === 0) {
      throw new NotFoundException(
        'No hay una inscripción viva con ese número en este cuadro.',
      );
    }

    return { id };
  }

  /** Mete en el cuadro al que estaba esperando, si quedó lugar. */
  async promover(
    torneoCategoriaId: number,
    id: number,
  ): Promise<{ id: number }> {
    return this.prisma.$transaction(async (tx) => {
      const cuadro = await this.tomarElCuadro(tx, torneoCategoriaId, false);

      const tomados = await tx.inscripcionTorneo.count({
        where: { torneoCategoriaId, estado: EstadoInscripcionTorneo.INSCRITA },
      });

      if (tomados >= cuadro.cupo) {
        throw new ConflictException(
          `El cuadro ya tiene sus ${cuadro.cupo} jugadores. Retira a alguien primero.`,
        );
      }

      const { count } = await tx.inscripcionTorneo.updateMany({
        where: {
          id,
          torneoCategoriaId,
          estado: EstadoInscripcionTorneo.LISTA_ESPERA,
        },
        data: { estado: EstadoInscripcionTorneo.INSCRITA },
      });

      if (count === 0) {
        throw new NotFoundException(
          'No hay nadie esperando con ese número en este cuadro.',
        );
      }

      return { id };
    });
  }

  /**
   * Asigna la siembra de un inscrito.
   *
   * **La pone el admin, no el ranking.** Es lo que hace hoy y lo que le permite
   * separar a dos socios que ya jugaron la final el mes pasado; el ranking se le
   * muestra al lado como sugerencia. Ver `SPEC-torneos.md` § El cuadro se arma una vez.
   */
  async sembrar(
    torneoCategoriaId: number,
    id: number,
    siembra: number | null,
  ): Promise<{ id: number }> {
    if (siembra !== null) {
      // **La siembra es por cuadro**: hay un sembrado 1 de 4ª y un sembrado 1 de
      // Honor, y son dos personas distintas. Buscar la repetida en el torneo entero
      // rechazaría la segunda sin motivo.
      const repetida = await this.prisma.inscripcionTorneo.findFirst({
        where: {
          torneoCategoriaId,
          siembra,
          estado: EstadoInscripcionTorneo.INSCRITA,
          id: { not: id },
        },
        select: { jugador: { select: { nombre: true, apellido: true } } },
      });

      if (repetida) {
        // Dos sembrados con el mismo número se pisan el lugar del cuadro, y el
        // segundo desaparecería del sorteo sin que nadie lo note.
        throw new ConflictException(
          `El ${siembra} ya es de ${repetida.jugador.nombre} ${repetida.jugador.apellido}.`,
        );
      }
    }

    const { count } = await this.prisma.inscripcionTorneo.updateMany({
      where: {
        id,
        torneoCategoriaId,
        estado: EstadoInscripcionTorneo.INSCRITA,
      },
      data: { siembra },
    });

    if (count === 0) {
      throw new NotFoundException(
        'No hay un inscrito con ese número en este cuadro.',
      );
    }

    return { id };
  }

  /** La lista de un cuadro, en tres grupos porque son tres cosas distintas. */
  async lista(torneoCategoriaId: number): Promise<ListaDelCuadro> {
    // El club mira esta lista para saber con quién cuenta. Quien eligió Webpay y no
    // pagó no es alguien con quien contar, y era justo lo que la lista mostraba.
    await this.abandonadas.liberar({ torneoCategoriaId });

    const cuadro = await this.prisma.torneoCategoria.findUnique({
      where: { id: torneoCategoriaId },
      select: {
        id: true,
        torneoId: true,
        cupo: true,
        montoInscripcionClp: true,
        categoriaJuego: { select: { nombre: true } },
        torneo: { select: { estado: true } },
      },
    });

    if (!cuadro)
      throw new NotFoundException('No hay un cuadro con ese número.');

    const filas = await this.prisma.inscripcionTorneo.findMany({
      where: { torneoCategoriaId },
      // Por llegada: la lista de espera se atiende en ese orden. Los sembrados suben
      // después, en memoria, porque MySQL pone los nulos **primero** en un `ASC` y
      // ordenar por siembra dejaba a los sembrados al final de la lista, que es justo
      // al revés de como el club lee un cuadro.
      orderBy: [{ inscritaEn: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        jugadorId: true,
        siembra: true,
        estado: true,
        inscritaEn: true,
        estadoPago: true,
        medioPago: true,
        email: true,
        // **La ruta no sale de acá.** Se lee para responder si hay algo que mirar y
        // se convierte en un booleano: es una ruta del disco del servidor.
        comprobanteRuta: true,
        jugador: {
          select: {
            nombre: true,
            apellido: true,
            telefono: true,
            procedencia: true,
            socio: { select: { numeroSocio: true } },
          },
        },
        restricciones: {
          orderBy: [{ diaSemana: 'asc' }, { horaDesde: 'asc' }],
          select: { diaSemana: true, horaDesde: true, horaHasta: true },
        },
      },
    });

    const inscripciones = ordenarPorSiembra(
      filas.map((fila) => ({
        id: fila.id,
        jugadorId: fila.jugadorId,
        jugador: `${fila.jugador.nombre} ${fila.jugador.apellido}`,
        numeroSocio: fila.jugador.socio?.numeroSocio ?? null,
        procedencia: fila.jugador.procedencia,
        siembra: fila.siembra,
        estado: fila.estado,
        inscritaEn: fila.inscritaEn,
        estadoPago: fila.estadoPago,
        medioPago: fila.medioPago,
        tieneComprobante: fila.comprobanteRuta !== null,
        telefono: fila.jugador.telefono,
        email: fila.email,
        restricciones: fila.restricciones,
      })),
    );

    return {
      torneoId: cuadro.torneoId,
      torneoCategoriaId: cuadro.id,
      categoria: cuadro.categoriaJuego.nombre,
      cupo: cuadro.cupo,
      montoClp: cuadro.montoInscripcionClp,
      estado: cuadro.torneo.estado,
      inscritos: inscripciones.filter(
        (i) => i.estado === EstadoInscripcionTorneo.INSCRITA,
      ),
      enEspera: inscripciones.filter(
        (i) => i.estado === EstadoInscripcionTorneo.LISTA_ESPERA,
      ),
      retirados: inscripciones.filter(
        (i) => i.estado === EstadoInscripcionTorneo.RETIRADA,
      ),
    };
  }

  /**
   * Toma la fila del **cuadro** como cerrojo y comprueba que se pueda inscribir.
   *
   * `FOR UPDATE` sobre `torneo_categoria` y ya no sobre `torneo`: el cupo es del
   * cuadro, así que serializar por torneo pondría en fila a los que se inscriben en
   * Honor detrás de los de la 4ª sin ninguna razón. La fila existe siempre y se toma
   * por clave primaria. Es el mismo mecanismo de `Inscripciones` en `clases` y de
   * `ReservasService.bloquearAlSocio`.
   *
   * **Se cierra por cuadro y no por torneo.** Un cuadro con la semilla puesta ya está
   * armado y no acepta a nadie más; el de al lado puede seguir inscribiendo. El cierre
   * por fecha, en cambio, sí es del torneo: es lo que el club publica en un afiche.
   */
  private async tomarElCuadro(
    tx: Prisma.TransactionClient,
    torneoCategoriaId: number,
    exigirAbierto = true,
  ): Promise<{ cupo: number; torneoId: number; montoClp: number }> {
    await tx.$queryRaw`SELECT id FROM torneo_categoria WHERE id = ${torneoCategoriaId} FOR UPDATE`;

    const cuadro = await tx.torneoCategoria.findUnique({
      where: { id: torneoCategoriaId },
      select: {
        cupo: true,
        torneoId: true,
        semillaSorteo: true,
        montoInscripcionClp: true,
        categoriaJuego: { select: { nombre: true } },
        torneo: { select: { estado: true, cierreInscripcion: true } },
      },
    });

    if (!cuadro)
      throw new NotFoundException('No hay un cuadro con ese número.');

    if (exigirAbierto) {
      if (cuadro.semillaSorteo !== null) {
        throw new ConflictException(
          `El cuadro de ${cuadro.categoriaJuego.nombre} ya está armado: no acepta más inscritos.`,
        );
      }

      if (cuadro.torneo.estado === EstadoTorneo.CANCELADO) {
        throw new ConflictException('Ese torneo está cancelado.');
      }

      // El último día de inscripción cuenta entero, como `alDiaHasta` en identidad:
      // la fecha del papel es la última que vale.
      if (cuadro.torneo.cierreInscripcion < hoyEnElClub()) {
        throw new ConflictException(
          'La inscripción de ese torneo ya se cerró.',
        );
      }
    }

    return {
      cupo: cuadro.cupo,
      torneoId: cuadro.torneoId,
      montoClp: cuadro.montoInscripcionClp,
    };
  }

  /** Quién es, si ya está inscrito; nada si no lo está. */
  private async yaEsta(
    tx: Prisma.TransactionClient,
    torneoId: number,
    jugadorId: number,
  ): Promise<string | null> {
    const suya = await tx.inscripcionTorneo.findFirst({
      where: {
        torneoId,
        jugadorId,
        estado: { not: EstadoInscripcionTorneo.RETIRADA },
      },
      select: { jugador: { select: { nombre: true, apellido: true } } },
    });

    return suya && `${suya.jugador.nombre} ${suya.jugador.apellido}`;
  }
}

/**
 * Los sembrados arriba y en orden; el resto, como llegaron.
 *
 * En memoria y no en el `ORDER BY` porque MySQL pone los nulos primero en un `ASC`:
 * ordenar por siembra dejaba al 1 y al 2 debajo de todos los sin sembrar, que es al
 * revés de como se lee un cuadro.
 */
function ordenarPorSiembra(
  inscripciones: InscripcionPublicada[],
): InscripcionPublicada[] {
  return [...inscripciones].sort((una, otra) => {
    if (una.siembra !== null && otra.siembra !== null) {
      return una.siembra - otra.siembra;
    }

    if (una.siembra !== null) return -1;
    if (otra.siembra !== null) return 1;

    return una.inscritaEn.getTime() - otra.inscritaEn.getTime();
  });
}
