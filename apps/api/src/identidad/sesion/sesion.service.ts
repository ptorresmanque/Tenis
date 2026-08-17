import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { coincide, HASH_SENUELO } from '../contrasena';
import { hashDeToken, nuevoToken } from '../token';
import { UsuarioConFichas } from '../usuario-actual';
import { DIAS_DE_SESION } from './cookie';

const VIDA_MS = DIAS_DE_SESION * 24 * 60 * 60 * 1000;

/** Se extiende recién cuando pasó la mitad de la vida, no en cada request. */
const UMBRAL_DE_RENOVACION_MS = VIDA_MS / 2;

@Injectable()
export class SesionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida las credenciales y abre una sesión. Devuelve el token para la cookie, o
   * null si no entra — sin decir cuál de las dos cosas falló.
   */
  async iniciar(email: string, contrasena: string): Promise<string | null> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });

    // Se verifica siempre, contra el señuelo si hace falta: responder rápido cuando
    // el correo no existe convierte el login en un buscador de socios.
    const valida = await coincide(
      usuario?.passwordHash ?? HASH_SENUELO,
      contrasena,
    );

    if (!usuario?.passwordHash || !valida) {
      return null;
    }

    return this.abrirPara(usuario.id);
  }

  /**
   * Abre una sesión para un usuario ya identificado. La usa el ingreso con Google,
   * que verifica la identidad contra Google y no contra una contraseña de acá.
   */
  async abrirPara(usuarioId: number): Promise<string> {
    // Las sesiones se borran al usarlas si están vencidas, pero una abandonada
    // —el navegador de un locutorio, un teléfono perdido— no se usa nunca más y
    // se quedaría en la tabla para siempre. Entrar de nuevo es el momento barato
    // de barrer las propias.
    await this.prisma.sesion.deleteMany({
      where: { usuarioId, expiraEn: { lte: new Date() } },
    });

    const token = nuevoToken();
    await this.prisma.sesion.create({
      data: {
        tokenHash: hashDeToken(token),
        usuarioId,
        expiraEn: new Date(Date.now() + VIDA_MS),
      },
    });

    return token;
  }

  /**
   * Resuelve la sesión de una request y la renueva si le queda poca vida.
   *
   * Trae las fichas de socio y profesor porque de eso se arma `UsuarioActual`, que
   * es lo que preguntan todos los guards y todos los módulos.
   */
  async usuarioDe(token: string): Promise<UsuarioConFichas | null> {
    const sesion = await this.prisma.sesion.findUnique({
      where: { tokenHash: hashDeToken(token) },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
            esAdmin: true,
            socio: { select: { id: true, estado: true, alDiaHasta: true } },
            profesor: { select: { id: true } },
          },
        },
      },
    });

    if (!sesion) {
      return null;
    }

    const ahora = Date.now();
    if (sesion.expiraEn.getTime() <= ahora) {
      // Vencida: se borra en el momento en que alguien la usa. Sin job de limpieza
      // programado, que es una pieza más que puede fallar en silencio.
      await this.cerrar(token);
      return null;
    }

    if (sesion.expiraEn.getTime() - ahora < UMBRAL_DE_RENOVACION_MS) {
      await this.prisma.sesion.update({
        where: { tokenHash: sesion.tokenHash },
        data: { expiraEn: new Date(ahora + VIDA_MS) },
      });
    }

    return sesion.usuario;
  }

  /**
   * Echa a un usuario de todas partes. La usa la vinculación con Google cuando
   * anula una contraseña que nadie demostró ser suya: sin esto, quien la había
   * puesto conserva la sesión que ya tenía abierta.
   */
  async cerrarTodasDe(usuarioId: number): Promise<void> {
    await this.prisma.sesion.deleteMany({ where: { usuarioId } });
  }

  async cerrar(token: string): Promise<void> {
    // deleteMany y no delete: cerrar una sesión que ya no está no es un error.
    await this.prisma.sesion.deleteMany({
      where: { tokenHash: hashDeToken(token) },
    });
  }
}
