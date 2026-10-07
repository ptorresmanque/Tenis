import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { hashear, problemaDeContrasena } from './contrasena';
import { CorreoSaliente, EnviadorCorreo, enviarOAnotar } from './correo';
import { DatosRegistro } from './registro.dto';
import { InvitacionesService } from './socios/invitaciones.service';
import { hashDeToken, nuevoToken } from './token';

const HORAS_DE_VIGENCIA_DEL_ENLACE = 24;

function enlaceDeVerificacion(token: string): string {
  const api =
    process.env.API_PUBLIC_URL ??
    `http://localhost:${process.env.PORT ?? 3000}/api`;

  return `${api}/auth/verificar?token=${token}`;
}

function vencimientoDelEnlace(): Date {
  return new Date(Date.now() + HORAS_DE_VIGENCIA_DEL_ENLACE * 60 * 60 * 1000);
}

function correoDeVerificacion(
  para: string,
  saludo: string,
  token: string,
): CorreoSaliente {
  return {
    para,
    asunto: 'Verifica tu correo — FEDAL Tennis Center',
    cuerpo:
      `${saludo}\n\nPara terminar de crear tu cuenta, abre este ` +
      `enlace:\n\n${enlaceDeVerificacion(token)}\n\nEl enlace vence en ` +
      `${HORAS_DE_VIGENCIA_DEL_ENLACE} horas.\n`,
  };
}

@Injectable()
export class RegistroService {
  private readonly log = new Logger('Registro');

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: EnviadorCorreo,
    private readonly invitaciones: InvitacionesService,
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
    const token = nuevoToken();

    let creado: { id: number };

    try {
      creado = await this.prisma.usuario.create({
        data: {
          email: datos.email,
          nombre: datos.nombre,
          apellido: datos.apellido,
          telefono: datos.telefono,
          passwordHash,
          verificacionTokenHash: hashDeToken(token),
          verificacionExpiraEn: vencimientoDelEnlace(),
        },
        select: { id: true },
      });
    } catch (error) {
      // El correo ya está tomado. Lo decide el índice único y no una consulta
      // previa: entre el `findUnique` y el `create` cabe otro registro igual.
      if (!esViolacionDeUnicidad(error)) {
        throw error;
      }

      // Si no sale, al log y no un error, como el de verificación de abajo: si
      // fallara solo uno de los dos caminos, un sendmail caído diría quién tiene
      // cuenta.
      await enviarOAnotar(
        this.correo,
        {
          para: datos.email,
          asunto: 'Alguien intentó registrarse con tu correo',
          cuerpo:
            `Hola,\n\nYa hay una cuenta de FEDAL Tennis Center con este correo, así que ` +
            `no creamos otra.\n\nSi fuiste tú, entra con tu contraseña. Si no la ` +
            `recuerdas, pide recuperarla desde la pantalla de ingreso.\n`,
        },
        this.log,
      );
      return;
    }

    // **Fuera del `try` a propósito.** Adentro, un número de socio repetido —que
    // también es una violación de unicidad— se leería como "el correo ya está
    // tomado" y le mandaría a esta persona el aviso equivocado.
    //
    // Si el club lo había dado de alta como socio, acá le aparece la ficha. No
    // cambia nada de lo que se responde: una respuesta distinta para un correo
    // invitado diría quién es socio a cualquiera que pruebe direcciones.
    await this.invitaciones.asociarSiInvitado(creado.id, datos.email);

    // El enlace se pide de nuevo desde /verificar-correo si este no sale.
    await enviarOAnotar(
      this.correo,
      correoDeVerificacion(datos.email, `Hola ${datos.nombre},`, token),
      this.log,
    );
  }

  /**
   * Le manda un enlace de verificación nuevo a una cuenta que todavía no verifica
   * su correo: el primero venció, o no salió al registrarse. El anterior deja de
   * servir, porque en la cuenta cabe un solo token.
   *
   * No devuelve nada, por lo mismo que `registrar`.
   */
  async pedirEnlaceNuevo(email: string): Promise<void> {
    const token = nuevoToken();

    // Un solo UPDATE, el mismo exista o no la cuenta. Buscarla primero y escribir
    // solo si existe sumaría una consulta justo en el caso que hay que esconder.
    const { count } = await this.prisma.usuario.updateMany({
      where: { email, emailVerificado: false },
      data: {
        verificacionTokenHash: hashDeToken(token),
        verificacionExpiraEn: vencimientoDelEnlace(),
      },
    });

    if (count === 0) {
      return;
    }

    // **Después de responder, a propósito.** A un correo sin cuenta no se le manda
    // nada, así que esperar el envío alargaría la respuesta solo cuando la cuenta
    // existe, y un sendmail caído respondería error solo en ese caso. Es el mismo
    // cuidado que el hash de `registrar`: lo caro queda fuera de la diferencia.
    //
    // `setImmediate` y no una promesa sin `await`: un `then` corre antes de que se
    // escriba la respuesta, y con él la parte síncrona del adaptador —armar el
    // mensaje y lanzar sendmail—. Lo que sigue distinguiendo los dos caminos es que
    // el UPDATE escriba o no una fila, del mismo orden que en el registro.
    setImmediate(
      () =>
        void enviarOAnotar(
          this.correo,
          correoDeVerificacion(email, 'Hola,', token),
          this.log,
        ),
    );
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
