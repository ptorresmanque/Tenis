import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { esViolacionDeUnicidad } from '../prisma/errores';
import {
  CambiosDeConfiguracion,
  DatosBloqueo,
  DatosCancha,
  DatosFranja,
  DatosHorario,
} from './admin.dto';
import { DisponibilidadService } from './disponibilidad.service';

/** Una cancha con horas de apertura que ninguna tarifa cubre. */
export interface AdvertenciaDeTarifa {
  canchaId: number;
  nombre: string;
  /** Los bloques que hoy saldrían gratis, en UTC. */
  sinTarifa: string[];
}

@Injectable()
export class AdminCanchasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disponibilidad: DisponibilidadService,
  ) {}

  /**
   * Todas, también las desactivadas: si el panel solo mostrara las activas,
   * desactivar una sería un viaje de ida.
   */
  canchas() {
    return this.prisma.cancha.findMany({
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      include: {
        horarios: { orderBy: { diaSemana: 'asc' } },
        franjas: { orderBy: { horaDesde: 'asc' } },
      },
    });
  }

  /** Las reglas del club. Una sola fila, y la base lo impone con un CHECK. */
  configuracion() {
    return this.prisma.configuracionClub.findFirstOrThrow();
  }

  /**
   * Cambia las reglas del club.
   *
   * `update` sobre la fila que ya existe y nunca `create`: la configuración no se
   * versiona ni se duplica, y una segunda fila haría que "la configuración del
   * club" dependa de cuál lea cada consulta.
   *
   * Nada más que guardar: quien consume las reglas —la grilla, el cupo del socio,
   * las ventanas de modificación— las lee de la base en cada operación, así que el
   * cambio rige desde la petición siguiente sin reiniciar nada.
   */
  async fijarConfiguracion(cambios: Partial<CambiosDeConfiguracion>) {
    const actual = await this.configuracion();

    return this.prisma.configuracionClub.update({
      where: { id: actual.id },
      data: cambios,
    });
  }

  async crear(datos: DatosCancha) {
    try {
      return await this.prisma.cancha.create({
        data: { ...datos, orden: datos.orden ?? (await this.siguienteOrden()) },
      });
    } catch (error) {
      if (esViolacionDeUnicidad(error)) {
        // Sin traducirlo, el nombre repetido sale como un 500 y el admin no se
        // entera de que el problema es que ya existe esa cancha.
        throw new ConflictException('Ya hay una cancha con ese nombre.');
      }

      throw error;
    }
  }

  async editar(
    id: number,
    cambios: Partial<DatosCancha & { activa: boolean }>,
  ) {
    await this.laCancha(id);

    try {
      return await this.prisma.cancha.update({ where: { id }, data: cambios });
    } catch (error) {
      if (esViolacionDeUnicidad(error)) {
        throw new ConflictException('Ya hay una cancha con ese nombre.');
      }

      throw error;
    }
  }

  /**
   * Borra una cancha, pero solo si nunca tuvo una reserva.
   *
   * Desactivar y eliminar responden a dos situaciones distintas: la cancha que el
   * club dejó de usar, y la que alguien creó con el nombre mal escrito. Sin esto,
   * el panel acumula para siempre las equivocaciones de tipeo.
   *
   * **El 409 protege el historial.** `Reserva.canchaId` borra en cascada, así que
   * eliminar una cancha con reservas se lleva lo que el club facturó y deja las
   * transacciones de `pagos` —que apuntan a la reserva por `conceptoId`, sin
   * foreign key— señalando filas que ya no existen. Cuenta **todas** las reservas,
   * también canceladas y expiradas: son historial igual.
   *
   * Va en el servidor y no como aviso del panel porque el 409 tiene que valer
   * también para quien llame la API a mano.
   *
   * ponytail: entre el conteo y el borrado cabe una reserva nueva, que se iría en
   * la cascada. La ventana es de milisegundos sobre una cancha que el admin acaba
   * de ver sin historial. Cerrarla de verdad es cambiar la FK a `Restrict` y
   * traducir el error de la base; hoy eso rompería la limpieza de media suite de
   * tests, que borra canchas contando con la cascada.
   */
  async eliminar(id: number): Promise<void> {
    await this.laCancha(id);

    const reservas = await this.prisma.reserva.count({
      where: { canchaId: id },
    });

    if (reservas > 0) {
      throw new ConflictException(
        `Esta cancha tiene ${reservas === 1 ? 'una reserva' : `${reservas} reservas`} ` +
          'en su historial y borrarla se las llevaría. Desactívala: sale de la ' +
          'grilla pública y el historial se mantiene.',
      );
    }

    // Horarios, tarifas y bloqueos se van con ella por la cascada del schema: no
    // significan nada sin su cancha.
    await this.prisma.cancha.delete({ where: { id } });
  }

  /**
   * Lo que rige donde la cancha no dice otra cosa: las filas con `canchaId` nulo.
   *
   * El panel las llama "el general del club" desde T13 y hasta T31 solo las ponía
   * el seed, así que nombraba algo que no se podía cambiar.
   */
  async general() {
    const [horarios, franjas] = await Promise.all([
      this.prisma.horarioApertura.findMany({
        where: { canchaId: null },
        orderBy: { diaSemana: 'asc' },
      }),
      this.prisma.franjaHoraria.findMany({
        where: { canchaId: null },
        orderBy: { horaDesde: 'asc' },
      }),
    ]);

    return { horarios, franjas };
  }

  /**
   * Reemplaza el horario completo de una cancha, o el general del club.
   *
   * `canchaId` nulo es el del club: el mismo código porque es la misma operación
   * sobre la misma tabla, y separarlos dejaría dos versiones del reemplazo entero
   * de las que una envejecería.
   *
   * En una transacción: si el borrado saliera y la escritura no, la cancha
   * quedaría sin horario y desaparecería de la grilla sin que nadie lo pidiera.
   */
  async fijarHorarios(canchaId: number | null, horarios: DatosHorario[]) {
    if (canchaId !== null) {
      await this.laCancha(canchaId);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.horarioApertura.deleteMany({ where: { canchaId } });
      await tx.horarioApertura.createMany({
        data: horarios.map((horario) => ({ ...horario, canchaId })),
      });

      return tx.horarioApertura.findMany({
        where: { canchaId },
        orderBy: { diaSemana: 'asc' },
      });
    });
  }

  /**
   * Crea una tarifa y **cierra la que cubría el mismo tramo**, en vez de dejar las
   * dos abiertas.
   *
   * Cambiar un precio es esto: una tarifa nueva desde una fecha, no una edición de
   * la anterior. La vieja no se borra —el monto de una reserva ya pagada se
   * justifica con la tarifa que regía ese día, y sin ella ese cobro queda sin
   * explicación— y se cierra la víspera: cerrarla el mismo día dejaría a las dos
   * rigiendo esa fecha y cuál gana lo decidiría el desempate de `franjaPara`.
   *
   * Solo el tramo exacto. Los solapamientos parciales los resuelve `franjaPara`
   * por especificidad, y adivinar cuál "reemplaza" a cuál sería magia.
   *
   * El tramo incluye el tipo de cancha (T98): "techadas de 06 a 07" no reemplaza a
   * "todas de 06 a 07", la acompaña. Sin esto, cerraba la general y las abiertas
   * quedaban sin tarifa.
   */
  async crearFranja(datos: DatosFranja) {
    if (datos.canchaId !== null) {
      await this.laCancha(datos.canchaId);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.franjaHoraria.updateMany({
        where: {
          canchaId: datos.canchaId,
          techada: datos.techada,
          diaSemana: datos.diaSemana,
          horaDesde: datos.horaDesde,
          horaHasta: datos.horaHasta,
          vigenteHasta: null,
        },
        data: { vigenteHasta: vispera(datos.vigenteDesde) },
      });

      return tx.franjaHoraria.create({ data: datos });
    });
  }

  async borrarFranja(id: number): Promise<void> {
    const borradas = await this.prisma.franjaHoraria.deleteMany({
      where: { id },
    });

    if (borradas.count === 0) {
      throw new NotFoundException('No hay una tarifa con ese número.');
    }
  }

  /**
   * Los bloqueos vigentes y futuros de una cancha, del más próximo al más lejano.
   *
   * Los que ya terminaron no se listan: no hay nada que administrar en una
   * mantención del año pasado, y sin este filtro la lista del panel crece para
   * siempre hasta volverse ilegible.
   */
  async bloqueos(canchaId: number, ahora = new Date()) {
    await this.laCancha(canchaId);

    return this.prisma.bloqueo.findMany({
      where: { canchaId, fin: { gte: ahora } },
      orderBy: { inicio: 'asc' },
    });
  }

  async crearBloqueo(datos: DatosBloqueo) {
    await this.laCancha(datos.canchaId);

    return this.prisma.bloqueo.create({ data: datos });
  }

  async borrarBloqueo(id: number): Promise<void> {
    const borrados = await this.prisma.bloqueo.deleteMany({ where: { id } });

    if (borrados.count === 0) {
      throw new NotFoundException('No hay un bloqueo con ese número.');
    }
  }

  /**
   * Qué horas de qué canchas quedarían sin cobrar ese día.
   *
   * Un bloque sin franja vale 0 y no es pico: legal según la spec, pero casi
   * siempre significa que el admin olvidó una tarifa y el club está regalando
   * horas de cancha sin enterarse.
   *
   * Se mira el monto y no si hubo franja, así que una tarifa puesta a propósito en
   * $0 también se advierte. Distinguirlas obligaría a que `BloqueDisponible`
   * cargue un campo que solo sirve acá, y el club no tiene canchas gratis: el día
   * que las tenga, esto avisará todos los días y habrá que separarlas.
   */
  async advertencias(fecha: string): Promise<AdvertenciaDeTarifa[]> {
    const canchas = await this.disponibilidad.canchas();

    const porCancha = await Promise.all(
      canchas.map(async (cancha) => ({
        canchaId: cancha.id,
        nombre: cancha.nombre,
        sinTarifa: (await this.disponibilidad.de(cancha.id, fecha))
          .filter((bloque) => !bloque.bloqueado && bloque.montoClp === 0)
          .map((bloque) => bloque.inicio.toISOString()),
      })),
    );

    return porCancha.filter((cancha) => cancha.sinTarifa.length > 0);
  }

  /**
   * Al final de la lista, no al principio.
   *
   * Con `orden` en 0 por defecto, una cancha nueva se colaba antes que todas las
   * que el club ya había ordenado, y el admin tenía que reordenarlas para deshacer
   * algo que nunca pidió.
   */
  private async siguienteOrden(): Promise<number> {
    const ultima = await this.prisma.cancha.findFirst({
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });

    return (ultima?.orden ?? 0) + 1;
  }

  /** Existe o 404. Editar una cancha que no está no puede pasar en silencio. */
  private async laCancha(id: number): Promise<void> {
    const cancha = await this.prisma.cancha.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!cancha) {
      throw new NotFoundException('No hay una cancha con ese número.');
    }
  }
}

/**
 * El día anterior a una fecha civil, como fecha civil.
 *
 * Aritmética en UTC sobre una `@db.Date`, que es medianoche UTC: restar un día no
 * puede caer en otra fecha por una zona horaria, y por eso no pasa por el reloj del
 * club.
 */
function vispera(fecha: Date): Date {
  return new Date(fecha.getTime() - 24 * 60 * 60 * 1000);
}
