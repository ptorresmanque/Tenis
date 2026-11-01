import { Controller, Get } from '@nestjs/common';

import { hoyEnElClub } from '../comun/tiempo';
import { PrismaService } from '../prisma/prisma.service';
import { QuizasYo, SesionOpcional } from './guards';
import { diasDeGraciaRestantes } from './usuario-actual';
// `import type`: con isolatedModules y emitDecoratorMetadata, un tipo que aparece
// en una firma decorada no puede entrar como import normal.
import type { UsuarioActual } from './usuario-actual';

/**
 * Lo que responde `GET /api/yo`: el contrato de siempre, más los días de gracia (T381).
 *
 * **Los días van acá y no en `UsuarioActual`**, que arma el guard en cada request con
 * sesión: ahí costarían una consulta más por request para un dato que solo lee la SPA al
 * arrancar, para mostrar el aviso de la cuota (SPEC-cuotas.md § Días de gracia).
 */
export type Yo = UsuarioActual & { diasDeGraciaRestantes: number | null };

@Controller('yo')
export class YoController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Quién está mirando. La SPA lo consulta al arrancar para saber qué mostrar;
   * lo que se puede *hacer* lo deciden los guards en cada endpoint.
   *
   * **Responde 200 con `null` cuando no hay sesión, y no 401.** Preguntar quién
   * soy con respuesta "nadie" es información válida, no un error: un 401 dice
   * "no estás autorizado a esto", y a saber si hay sesión lo está cualquiera.
   *
   * El cambio es del 2026-09-08 y salió de la auditoría del rediseño: la SPA
   * llama a este endpoint al arrancar en **todas** las páginas, así que cada
   * visita sin sesión dejaba un error rojo en la consola. Ese es justo el ruido
   * que hace que nadie mire la consola cuando aparece un error de verdad.
   *
   * Va con `@SesionOpcional()`, que hace el mismo trabajo que `@Autenticado()`
   * menos el portazo: sin él nadie resolvería la cookie y este endpoint
   * respondería "nadie" incluso a quien sí tiene sesión abierta.
   */
  @Get()
  @SesionOpcional()
  async yo(@QuizasYo() usuario: UsuarioActual | null): Promise<Yo | null> {
    if (!usuario) return null;

    return {
      ...usuario,
      diasDeGraciaRestantes: await this.diasDeGracia(usuario),
    };
  }

  /**
   * Solo el socio activo con la cuota vencida tiene días que contar: para los demás
   * responde `null` sin ir a la base, y así la consulta de más la paga solo el moroso.
   * El suspendido tampoco: su problema es otro, y pagar no lo resuelve.
   */
  private async diasDeGracia(yo: UsuarioActual): Promise<number | null> {
    if (yo.socioId === null || !yo.socioActivo || yo.socioAlDia) return null;

    const [socio, config] = await Promise.all([
      this.prisma.socio.findUniqueOrThrow({
        where: { id: yo.socioId },
        select: { alDiaHasta: true },
      }),
      this.prisma.configuracionClub.findFirstOrThrow({
        select: { diasGraciaCuota: true },
      }),
    ]);

    return diasDeGraciaRestantes(
      socio.alDiaHasta,
      hoyEnElClub(),
      config.diasGraciaCuota,
    );
  }
}
