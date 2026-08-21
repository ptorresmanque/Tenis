import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SesionService } from '../sesion/sesion.service';
import { InvitacionesService } from '../socios/invitaciones.service';
import { PerfilGoogle } from './google.port';

/** Por qué no entró. Cada motivo lleva a un mensaje distinto en la SPA. */
export type MotivoDeRechazo =
  | 'correo_no_verificado'
  | 'sin_perfil'
  | 'sin_configurar'
  /** Se arrepintió en la pantalla de Google. No es una falla. */
  | 'cancelado';

export type ResultadoGoogle =
  { tokenSesion: string } | { rechazo: MotivoDeRechazo };

@Injectable()
export class GoogleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionService,
    private readonly invitaciones: InvitacionesService,
  ) {}

  /**
   * Resuelve a qué usuario corresponde el perfil de Google —creando o vinculando
   * la cuenta— y le abre una sesión.
   */
  async entrar(perfil: PerfilGoogle): Promise<ResultadoGoogle> {
    // La condición que sostiene todo SPEC-identidad.md § Vinculación de cuentas.
    // Se exige también para crear, no solo para vincular: una cuenta hecha con un
    // correo ajeno sin verificar se reclama después con el flujo de recuperación.
    if (!perfil.emailVerificado) {
      return { rechazo: 'correo_no_verificado' };
    }

    const usuarioId = await this.resolverUsuario(perfil);

    return { tokenSesion: await this.sesiones.abrirPara(usuarioId) };
  }

  private async resolverUsuario(perfil: PerfilGoogle): Promise<number> {
    const porGoogleId = await this.prisma.usuario.findUnique({
      where: { googleId: perfil.googleId },
      select: { id: true },
    });

    if (porGoogleId) {
      return porGoogleId.id;
    }

    const porEmail = await this.prisma.usuario.findUnique({
      where: { email: perfil.email },
      select: { id: true, emailVerificado: true },
    });

    if (porEmail) {
      // Vincular y no crear un duplicado: es la misma persona, con el correo que
      // Google acaba de confirmar que le pertenece.
      //
      // Si el correo de esa cuenta nunca se verificó, su contraseña la puso
      // alguien que jamás demostró ser el dueño del correo: cualquiera pudo
      // registrarlo y esperar. Esa contraseña se anula y sus sesiones se cierran,
      // así que la cuenta queda en manos de quien Google acaba de confirmar. El
      // dueño puede fijar una contraseña nueva por el flujo de recuperación.
      const contrasenaSinDueñoProbado = !porEmail.emailVerificado;

      await this.prisma.usuario.update({
        where: { id: porEmail.id },
        data: {
          googleId: perfil.googleId,
          emailVerificado: true,
          ...(contrasenaSinDueñoProbado ? { passwordHash: null } : {}),
        },
      });

      if (contrasenaSinDueñoProbado) {
        await this.sesiones.cerrarTodasDe(porEmail.id);
      }

      return porEmail.id;
    }

    const creado = await this.prisma.usuario.create({
      data: {
        email: perfil.email,
        nombre: perfil.nombre,
        apellido: perfil.apellido,
        googleId: perfil.googleId,
        // Lo verificó Google, que es justo lo que se acaba de comprobar arriba.
        emailVerificado: true,
        // Sin contraseña: nunca eligió una.
        passwordHash: null,
      },
      select: { id: true },
    });

    // El mismo punto que usa el registro con contraseña: si el club dio de alta
    // este correo como socio, la ficha aparece acá. Es el camino que nadie prueba
    // a mano, y por eso comparte código en vez de repetir la regla (T32).
    await this.invitaciones.asociarSiInvitado(creado.id, perfil.email);

    return creado.id;
  }
}
