import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { hoyEnElClub } from '../../comun/tiempo';
import {
  EstadoSocio,
  InvitacionSocio,
  Prisma,
} from '../../generated/prisma/client';
import { esViolacionDeUnicidad } from '../../prisma/errores';
import { PrismaService } from '../../prisma/prisma.service';

export interface DatosInvitacion {
  email: string;
  /** Sin él, el club lo asigna correlativo. */
  numeroSocio?: string;
  /** Sin ella, hasta el último día del mes en curso. */
  alDiaHasta?: Date;
}

@Injectable()
export class InvitacionesService {
  private readonly logger = new Logger(InvitacionesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Los socios del club y las invitaciones que todavía nadie usó. */
  async listado() {
    const [socios, invitaciones] = await Promise.all([
      this.prisma.socio.findMany({
        orderBy: { numeroSocio: 'asc' },
        select: {
          id: true,
          numeroSocio: true,
          estado: true,
          alDiaHasta: true,
          usuario: { select: { nombre: true, apellido: true, email: true } },
        },
      }),
      // Solo las pendientes: una usada ya es un socio de la lista de arriba, y
      // mostrarla dos veces hace creer que falta algo por hacer.
      this.prisma.invitacionSocio.findMany({
        where: { usadaEn: null },
        orderBy: { creadaEn: 'desc' },
      }),
    ]);

    return { socios, invitaciones };
  }

  /**
   * Da de alta a un socio con solo su correo.
   *
   * **Si el correo ya tiene cuenta, la ficha se crea en el acto** y la invitación
   * nace usada. Sin eso, invitar a alguien que ya se había registrado como
   * visitante no produce ningún efecto visible y el admin no se entera.
   */
  async invitar(datos: DatosInvitacion): Promise<InvitacionSocio> {
    const email = datos.email.trim().toLowerCase();

    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true, socio: { select: { id: true } } },
    });

    if (usuario?.socio) {
      throw new ConflictException(
        'Ese correo ya es socio del club. Su ficha se edita desde la lista de socios.',
      );
    }

    let invitacion: InvitacionSocio;
    try {
      invitacion = await this.prisma.invitacionSocio.create({
        data: {
          email,
          numeroSocio: datos.numeroSocio ?? (await this.siguienteNumero()),
          alDiaHasta: datos.alDiaHasta ?? finDelMesEnCurso(),
        },
      });
    } catch (error) {
      if (!esViolacionDeUnicidad(error)) throw error;

      // El correo o el número ya estaban tomados. Lo decide el índice único y no
      // una consulta previa: entre el `findUnique` y el `create` cabe otra alta.
      throw new ConflictException(
        'Ya hay una invitación con ese correo o ese número de socio.',
      );
    }

    if (usuario) {
      await this.asociar(usuario.id, invitacion);
    }

    return invitacion;
  }

  /**
   * **El único punto donde una cuenta nueva se vuelve socia.**
   *
   * Lo llaman el registro con contraseña y el alta por Google. Dos copias de esta
   * regla dejarían sin ficha a quien entra por Google, que es el camino que nadie
   * prueba a mano.
   *
   * **No lanza**, y por eso el `catch`: la cuenta ya está creada cuando esto corre,
   * así que dejar salir el error convertiría un alta exitosa en un 500 —sin correo
   * de verificación y con el usuario igualmente creado— por un número de socio que
   * alguien tomó entre medio. La invitación queda pendiente, el admin la ve en su
   * lista, y el fallo va al log para que exista en alguna parte.
   */
  async asociarSiInvitado(usuarioId: number, email: string): Promise<void> {
    const invitacion = await this.prisma.invitacionSocio.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!invitacion || invitacion.usadaEn !== null) return;

    try {
      await this.asociar(usuarioId, invitacion);
    } catch (error) {
      this.logger.error(
        `No se pudo asociar la invitación ${invitacion.id} al usuario ${usuarioId}. ` +
          'La cuenta quedó creada y la invitación sigue pendiente.',
        error,
      );
    }
  }

  async revocar(id: number): Promise<void> {
    const invitacion = await this.prisma.invitacionSocio.findUnique({
      where: { id },
    });

    if (!invitacion) {
      // 404 como el resto del panel: revocar algo que no está no puede pasar en
      // silencio, o el admin cree que borró una invitación que sigue viva.
      throw new NotFoundException('No hay una invitación con ese número.');
    }

    if (invitacion.usadaEn !== null) {
      // Borrarla no le quitaría la ficha a nadie: solo perdería la traza de que el
      // club invitó a esa persona. Dar de baja a un socio es cambiar su estado.
      throw new ConflictException(
        'Esa invitación ya se usó. Para dar de baja al socio, cambia su estado.',
      );
    }

    await this.prisma.invitacionSocio.delete({ where: { id } });
  }

  /**
   * Crea la ficha y marca la invitación, en una transacción.
   *
   * Juntas o ninguna: con la ficha creada y la invitación abierta, el próximo
   * registro con ese correo intentaría crear un segundo socio con el mismo número
   * y chocaría contra el único, dejando a esa persona sin poder entrar.
   */
  private async asociar(
    usuarioId: number,
    invitacion: InvitacionSocio,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.socio.create({
        data: {
          usuarioId,
          numeroSocio: invitacion.numeroSocio,
          estado: EstadoSocio.ACTIVO,
          fechaIngreso: hoyEnElClub(),
          alDiaHasta: invitacion.alDiaHasta,
        },
      });

      await tx.invitacionSocio.update({
        where: { id: invitacion.id },
        data: { usadaEn: new Date() },
      });
    });
  }

  /**
   * El siguiente número libre, en tres dígitos.
   *
   * Mira las fichas y las invitaciones pendientes: un número reservado en una
   * invitación todavía no tiene socio, y sin contarlo dos altas seguidas pedirían
   * el mismo. Los números que el club escribió a mano y no son un entero —"A-12"—
   * se ignoran para el cálculo; siguen siendo válidos como número de socio.
   */
  private async siguienteNumero(): Promise<string> {
    const [socios, invitaciones] = await Promise.all([
      this.prisma.socio.findMany({ select: { numeroSocio: true } }),
      this.prisma.invitacionSocio.findMany({ select: { numeroSocio: true } }),
    ]);

    const mayor = [...socios, ...invitaciones]
      .map((fila) => Number(fila.numeroSocio))
      .filter((numero) => Number.isInteger(numero))
      .reduce((mayor, numero) => Math.max(mayor, numero), 0);

    return String(mayor + 1).padStart(3, '0');
  }
}

/**
 * El último día del mes en curso, como fecha civil del club.
 *
 * Es el valor por defecto de `alDiaHasta`: el socio que se inscribe puede usar el
 * club el mes que se inscribió. Con la fecha de hoy quedaría moroso mañana, y con
 * una fecha lejana el club regalaría meses sin decidirlo.
 */
function finDelMesEnCurso(ahora = new Date()): Date {
  const hoy = hoyEnElClub(ahora);

  // Día 0 del mes siguiente es el último del actual, sin tabla de días por mes.
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0));
}
