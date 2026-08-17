import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { hashear, problemaDeContrasena } from './contrasena';
import { EnviadorCorreo } from './correo';
import { DatosRegistro } from './registro.dto';

const HORAS_DE_VIGENCIA_DEL_ENLACE = 24;

/** El token viaja por correo; en la base solo queda su hash. */
function hashDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function enlaceDeVerificacion(token: string): string {
  const api =
    process.env.API_PUBLIC_URL ??
    `http://localhost:${process.env.PORT ?? 3000}/api`;

  return `${api}/auth/verificar?token=${token}`;
}

@Injectable()
export class RegistroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: EnviadorCorreo,
  ) {}

  /**
   * Da de alta un visitante: un `Usuario` sin ficha de socio.
   *
   * No devuelve nada a propósito. Quien llama no puede saber si el correo ya
   * existía, así que tampoco puede filtrarlo en la respuesta.
   */
  async registrar(datos: DatosRegistro): Promise<void> {
    const problema = problemaDeContrasena(datos.contrasena);
    if (problema) {
      throw new BadRequestException(problema);
    }

    // Se hashea siempre, incluso cuando el correo ya existe. Hacerlo solo en el
    // caso nuevo dejaría una diferencia de ~50 ms entre "correo libre" y "correo
    // tomado", que es todo lo que hace falta para enumerar a los socios.
    const passwordHash = await hashear(datos.contrasena);
    const token = randomBytes(32).toString('base64url');

    try {
      await this.prisma.usuario.create({
        data: {
          email: datos.email,
          nombre: datos.nombre,
          apellido: datos.apellido,
          telefono: datos.telefono,
          passwordHash,
          verificacionTokenHash: hashDeToken(token),
          verificacionExpiraEn: new Date(
            Date.now() + HORAS_DE_VIGENCIA_DEL_ENLACE * 60 * 60 * 1000,
          ),
        },
      });
    } catch (error) {
      // El correo ya está tomado. Lo decide el índice único y no una consulta
      // previa: entre el `findUnique` y el `create` cabe otro registro igual.
      if (!esViolacionDeUnicidad(error)) {
        throw error;
      }

      await this.correo.enviar({
        para: datos.email,
        asunto: 'Alguien intentó registrarse con tu correo',
        cuerpo:
          `Hola,\n\nYa hay una cuenta del Club de Tenis con este correo, así que ` +
          `no creamos otra.\n\nSi fuiste vos, entrá con tu contraseña. Si no la ` +
          `recordás, pedí recuperarla desde la pantalla de ingreso.\n`,
      });
      return;
    }

    await this.correo.enviar({
      para: datos.email,
      asunto: 'Verificá tu correo — Club de Tenis',
      cuerpo:
        `Hola ${datos.nombre},\n\nPara terminar de crear tu cuenta, abrí este ` +
        `enlace:\n\n${enlaceDeVerificacion(token)}\n\nEl enlace vence en ` +
        `${HORAS_DE_VIGENCIA_DEL_ENLACE} horas.\n`,
    });
  }

  /** Marca el correo como verificado. Devuelve false si el enlace no sirve. */
  async verificar(token: string): Promise<boolean> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { verificacionTokenHash: hashDeToken(token) },
    });

    if (
      !usuario?.verificacionExpiraEn ||
      usuario.verificacionExpiraEn < new Date()
    ) {
      return false;
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      // El token se borra al usarlo: un enlace de verificación sirve una vez.
      data: {
        emailVerificado: true,
        verificacionTokenHash: null,
        verificacionExpiraEn: null,
      },
    });

    return true;
  }
}
