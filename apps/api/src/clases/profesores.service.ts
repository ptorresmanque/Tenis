import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import type { CambioDeFicha, FichaNueva } from './profesores.dto';

/**
 * La ficha completa, **para el panel del admin y solo para ahí**: incluye el teléfono
 * y la tarifa. La página pública de T48 lleva su propio `select`, más corto; reusar
 * este publicaría lo que el club le paga a cada profesor.
 */
const FICHA = {
  id: true,
  nombreVisible: true,
  telefono: true,
  especialidad: true,
  tarifaHoraClp: true,
  activo: true,
  /** Si tiene cuenta, y cuál: la lista de usuarios ofrece las que no (T217). */
  usuarioId: true,
} as const;

const YA_ES_PROFESOR =
  'Esa persona ya tiene una ficha de profesor. Quítasela antes de darle otra.';

/**
 * Quiénes dan clases en el club.
 *
 * **Desactivar es el borrar de este módulo.** Un profesor que se fue dio clases que
 * pasaron, y borrarlo se llevaría por delante quién las dio. Se desactiva: deja de
 * aparecer para agendar y su historia queda donde estaba. Por eso no hay `DELETE`.
 */
@Injectable()
export class Profesores {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Las fichas del panel.
   *
   * Con `soloActivos` es la lista para agendar, y el filtro vive en el servidor
   * porque es una regla y no una comodidad de pantalla: quien ya no está no vuelve
   * a la agenda ni aunque alguien mande su id a mano.
   */
  listar(soloActivos = false) {
    return this.prisma.profesor.findMany({
      where: soloActivos ? { activo: true } : {},
      // Los que están dando clases arriba: es la lista que el club usa a diario.
      orderBy: [{ activo: 'desc' }, { nombreVisible: 'asc' }],
      select: FICHA,
    });
  }

  /**
   * Anota un profesor, con su cuenta: entra al panel a ver y agendar sus clases
   * (`SPEC-clases.md` § El profesor en el panel). Desde T297 la cuenta no es opcional
   * (SPEC-panel.md D12); las fichas de antes sin cuenta siguen dando clases (D14).
   */
  async crear(ficha: FichaNueva, usuarioId: number) {
    await this.exigirUsuario(usuarioId);

    try {
      return await this.prisma.profesor.create({
        data: { ...ficha, usuarioId },
        select: FICHA,
      });
    } catch (error) {
      if (esViolacionDeUnicidad(error)) {
        throw new ConflictException(YA_ES_PROFESOR);
      }
      throw error;
    }
  }

  /**
   * Le da cuenta a una ficha que no la tiene (T217). El `updateMany` condicionado a
   * `usuarioId: null` es la comprobación y la escritura a la vez: dos admins que
   * vinculan la misma ficha al mismo tiempo no se pisan, el segundo recibe 409.
   */
  async vincular(id: number, usuarioId: number) {
    await this.exigirUsuario(usuarioId);

    let count: number;
    try {
      ({ count } = await this.prisma.profesor.updateMany({
        where: { id, usuarioId: null },
        data: { usuarioId },
      }));
    } catch (error) {
      if (esViolacionDeUnicidad(error)) {
        throw new ConflictException(YA_ES_PROFESOR);
      }
      throw error;
    }

    if (count === 0) {
      if ((await this.prisma.profesor.count({ where: { id } })) === 0) {
        throw new NotFoundException('No hay un profesor con ese número.');
      }
      throw new ConflictException(
        'Esta ficha ya tiene una cuenta. Quítasela antes de darle otra.',
      );
    }

    return this.prisma.profesor.findUniqueOrThrow({
      where: { id },
      select: FICHA,
    });
  }

  private async exigirUsuario(id: number): Promise<void> {
    const existe = await this.prisma.usuario.count({ where: { id } });
    if (existe === 0) {
      throw new NotFoundException('No hay un usuario con ese id.');
    }
  }

  /** Cambia lo que venga y deja lo demás. Activar y desactivar entran por acá. */
  async editar(id: number, cambio: CambioDeFicha) {
    const { count } = await this.prisma.profesor.updateMany({
      where: { id },
      data: cambio,
    });

    if (count === 0) {
      throw new NotFoundException('No hay un profesor con ese número.');
    }

    return this.prisma.profesor.findUniqueOrThrow({
      where: { id },
      select: FICHA,
    });
  }
}
