import { Controller, Get } from '@nestjs/common';

import { QuizasYo, SesionOpcional } from './guards';
// `import type`: con isolatedModules y emitDecoratorMetadata, un tipo que aparece
// en una firma decorada no puede entrar como import normal.
import type { UsuarioActual } from './usuario-actual';

@Controller('yo')
export class YoController {
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
  yo(@QuizasYo() usuario: UsuarioActual | null): UsuarioActual | null {
    return usuario;
  }
}
