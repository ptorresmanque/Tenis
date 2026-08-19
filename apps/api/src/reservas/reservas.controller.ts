import { Body, Controller, Post } from '@nestjs/common';

import { SoloSocio, Yo } from '../identidad/guards';
// `import type`: con isolatedModules y emitDecoratorMetadata, un tipo que aparece en
// una firma decorada no puede importarse como valor. Mismo caso que `yo.controller`.
import type { UsuarioActual } from '../identidad/usuario-actual';
import { reservaDeSocioDeCuerpo } from './reservas.dto';
import { ReservasService } from './reservas.service';

@Controller('reservas')
export class ReservasController {
  constructor(private readonly reservas: ReservasService) {}

  /**
   * La reserva del socio. `@SoloSocio()` exige ficha de socio; que esté activo y al
   * día lo decide el servicio, que es quien puede distinguir "membresía suspendida"
   * de "cuota vencida" y decírselo.
   */
  @Post()
  @SoloSocio()
  async reservar(@Yo() yo: UsuarioActual, @Body() cuerpo: unknown) {
    return this.reservas.reservarComoSocio(yo, reservaDeSocioDeCuerpo(cuerpo));
  }
}
