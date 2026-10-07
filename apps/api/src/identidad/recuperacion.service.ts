import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { web } from '../comun/urls';
import { PrismaService } from '../prisma/prisma.service';
import { hashear, problemaDeContrasena } from './contrasena';
import { EnviadorCorreo, enviarOAnotar } from './correo';
import { hashDeToken, nuevoToken } from './token';

/**
 * Una hora: lo justo para abrir el correo y elegir la clave. A diferencia del enlace
 * de verificación, este cambia la contraseña de una cuenta que puede tener historia.
 */
const MINUTOS_DE_VIGENCIA = 60;

/**
 * Recuperar la contraseña con un enlace al correo. Es también el camino de quien
 * entraba solo con Google y quiere una contraseña (SPEC-identidad): abrir el enlace
 * prueba que el correo es suyo, que es lo único que se le puede pedir.
 */
@Injectable()
export class RecuperacionService {
  private readonly log = new Logger('Recuperación');

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: EnviadorCorreo,
  ) {}

  /**
   * Manda el enlace si el correo tiene cuenta. Pedir otro deja sin efecto el
   * anterior, porque en la cuenta cabe un solo token.
   *
   * No devuelve nada, por lo mismo que el registro: quien llama no puede saber si
   * el correo existía.
   */
  async pedir(email: string): Promise<void> {
    const token = nuevoToken();

    // Un solo UPDATE, el mismo exista o no la cuenta, como el reenvío de la
    // verificación.
    const { count } = await this.prisma.usuario.updateMany({
      where: { email },
      data: {
        recuperacionTokenHash: hashDeToken(token),
        recuperacionExpiraEn: new Date(
          Date.now() + MINUTOS_DE_VIGENCIA * 60 * 1000,
        ),
      },
    });

    if (count === 0) {
      return;
    }

    // Después de responder: a un correo sin cuenta no se le manda nada, así que
    // esperar el envío alargaría la respuesta solo cuando la cuenta existe.
    setImmediate(() => void this.enviar(email, token));
  }

  /**
   * Cambia la contraseña con el token del enlace. Devuelve false si el enlace no
   * sirve: inventado, vencido o ya usado.
   */
  async restablecer(token: string, contrasena: string): Promise<boolean> {
    const problema = problemaDeContrasena(contrasena);
    if (problema) {
      throw new BadRequestException(problema);
    }

    const tokenHash = hashDeToken(token);
    const usuario = await this.prisma.usuario.findUnique({
      where: { recuperacionTokenHash: tokenHash },
      select: { id: true },
    });
    if (!usuario) {
      return false;
    }

    const passwordHash = await hashear(contrasena);

    return this.prisma.$transaction(async (tx) => {
      // El token y su vigencia van en la condición y no se leen antes: dos envíos
      // del mismo enlace a la vez no pueden cambiarla los dos.
      const { count } = await tx.usuario.updateMany({
        where: {
          id: usuario.id,
          recuperacionTokenHash: tokenHash,
          recuperacionExpiraEn: { gt: new Date() },
        },
        data: {
          passwordHash,
          recuperacionTokenHash: null,
          recuperacionExpiraEn: null,
          // Abrir el enlace prueba que el correo es suyo.
          emailVerificado: true,
          verificacionTokenHash: null,
          verificacionExpiraEn: null,
        },
      });

      if (count === 0) {
        return false;
      }

      // Todas las sesiones, no solo las vencidas. Si alguien registró este correo
      // antes que su dueño y entró con su clave, cambiarla sin cerrarle la sesión lo
      // dejaría adentro igual.
      await tx.sesion.deleteMany({ where: { usuarioId: usuario.id } });

      return true;
    });
  }

  /**
   * El envío de `pedir`, que nadie espera: si falla, queda en el log.
   *
   * El token va en el fragmento (`#token=`) y no en la consulta (`?token=`): el
   * fragmento no viaja al servidor, así que no queda en el log de acceso de Apache ni
   * en el Referer que se llevan las fuentes de Google que carga cada página.
   */
  private enviar(email: string, token: string): Promise<void> {
    // Si no sale, al log: la persona puede pedir otro enlace.
    return enviarOAnotar(
      this.correo,
      {
        para: email,
        asunto: 'Elige una contraseña nueva — FEDAL Tennis Center',
        cuerpo:
          `Hola,\n\nPara elegir una contraseña nueva, abre este enlace:\n\n` +
          `${web()}/nueva-contrasena#token=${token}\n\n` +
          `Vence en una hora y sirve una sola vez. Si no lo pediste tú, ignora ` +
          `este correo: tu contraseña no cambia.\n`,
      },
      this.log,
      `No salió el enlace para cambiar la contraseña de ${email}`,
    );
  }
}
