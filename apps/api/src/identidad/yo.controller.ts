import { Controller, Get } from '@nestjs/common';

import { Autenticado, Yo } from './guards';
// `import type`: con isolatedModules y emitDecoratorMetadata, un tipo que aparece
// en una firma decorada no puede entrar como import normal.
import type { UsuarioActual } from './usuario-actual';

@Controller('yo')
export class YoController {
  /**
   * Quién está mirando. La SPA lo consulta al arrancar para saber qué mostrar;
   * lo que se puede *hacer* lo deciden los guards en cada endpoint.
   */
  @Get()
  @Autenticado()
  yo(@Yo() usuario: UsuarioActual): UsuarioActual {
    return usuario;
  }
}
