import { Injectable, Logger } from '@nestjs/common';

import { DatosDelClub, firmaDelClub } from '../comun/club';
import { web } from '../comun/urls';
import { EnviadorCorreo, enviarOAnotar } from '../identidad/correo';
import { PrismaService } from '../prisma/prisma.service';

/** Un comprobante recién llegado, con lo que su aviso dice. */
export interface ComprobanteParaRevisar {
  torneoId: number;
  /** El cuadro de su categoría: el enlace abre el panel ahí. */
  cuadroId: number;
  torneo: string;
  categoria: string;
  jugador: string;
  montoClp: number;
}

/**
 * El aviso a los administradores de que llegó un comprobante (T130, decisión 3 de la
 * sexta parte). El asunto lleva quién y qué categoría, que es lo que se busca en la
 * bandeja; el enlace abre los inscritos de esa categoría, donde se confirma o se rechaza.
 */
export function avisoDeComprobante(
  comprobante: ComprobanteParaRevisar,
  club: DatosDelClub,
  origenWeb: string,
): { asunto: string; cuerpo: string } {
  return {
    asunto: `Comprobante por revisar: ${comprobante.jugador}, ${comprobante.categoria}`,
    cuerpo:
      'Hola:\n\n' +
      'Llegó un comprobante de transferencia para revisar.\n\n' +
      `Torneo: ${comprobante.torneo}\n` +
      `Categoría: ${comprobante.categoria}\n` +
      `Jugador: ${comprobante.jugador}\n` +
      `Monto: $${comprobante.montoClp.toLocaleString('es-CL')}\n\n` +
      'Míralo y confírmalo o recházalo desde el panel:\n' +
      `${origenWeb}/administracion/torneos/${comprobante.torneoId}` +
      `?cuadro=${comprobante.cuadroId}\n\n` +
      firmaDelClub(club),
  };
}

/**
 * Los correos de un torneo, armados desde la base y enviados sin poner en juego la
 * inscripción: se llaman con la inscripción ya escrita, y si algo falla —la consulta o el
 * envío— queda en el log y la inscripción sigue como quedó.
 */
@Injectable()
export class AvisosDeTorneo {
  private readonly log = new Logger('Correo');

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: EnviadorCorreo,
  ) {}

  /**
   * Llegó un comprobante: un correo a **cada** administrador (decisión 3).
   *
   * Lo llama quien recibió la imagen del jugador —al inscribirse transfiriendo, o con su
   * llave después—, nunca el admin que la sube desde el panel: ese ya la tiene en la mano.
   */
  async comprobanteRecibido(inscripcionId: number): Promise<void> {
    try {
      const [fila, admins, club] = await Promise.all([
        this.prisma.inscripcionTorneo.findUniqueOrThrow({
          where: { id: inscripcionId },
          select: {
            torneoId: true,
            torneoCategoriaId: true,
            torneo: { select: { nombre: true } },
            torneoCategoria: {
              select: {
                montoInscripcionClp: true,
                categoriaJuego: { select: { nombre: true } },
              },
            },
            jugador: { select: { nombre: true, apellido: true } },
          },
        }),
        this.prisma.usuario.findMany({
          where: { esAdmin: true },
          select: { email: true },
        }),
        this.prisma.configuracionClub.findFirstOrThrow(),
      ]);

      const correo = avisoDeComprobante(
        {
          torneoId: fila.torneoId,
          cuadroId: fila.torneoCategoriaId,
          torneo: fila.torneo.nombre,
          categoria: fila.torneoCategoria.categoriaJuego.nombre,
          jugador: `${fila.jugador.nombre} ${fila.jugador.apellido}`,
          montoClp: fila.torneoCategoria.montoInscripcionClp,
        },
        club,
        web(),
      );

      // Uno por admin y no uno con todos en copia: cada uno ve solo su dirección, y un
      // correo que rebota no se lleva a los demás.
      for (const { email } of admins) {
        await enviarOAnotar(
          this.correo,
          { para: email, ...correo },
          this.log,
          `No salió el aviso del comprobante de la inscripción ${inscripcionId} para ${email}`,
        );
      }
    } catch (falla) {
      this.log.error(
        `No se pudo armar el aviso del comprobante de la inscripción ${inscripcionId}: ` +
          String(falla),
      );
    }
  }
}
