import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { Autenticado, SoloSocio, Yo } from '../identidad/guards';
// `import type`: con isolatedModules y emitDecoratorMetadata, un tipo que aparece en
// una firma decorada no puede importarse como valor. Mismo caso que `yo.controller`.
import type { UsuarioActual } from '../identidad/usuario-actual';
import { ModificacionService } from './modificacion.service';
import { leerDuracion } from './duracion';
import {
  destinoDeCuerpo,
  fechaDeConsulta,
  reservaDeSocioDeCuerpo,
} from './reservas.dto';
import { ReservasService } from './reservas.service';

@Controller('reservas')
export class ReservasController {
  constructor(
    private readonly reservas: ReservasService,
    private readonly modificacion: ModificacionService,
  ) {}

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

  /**
   * Las horas que el socio tiene tomadas.
   *
   * `@Autenticado()` y no `@SoloSocio()`: quien todavía no tiene ficha de socio recibe
   * una lista vacía, que es la verdad, y no un 403 que parece un error de la aplicación.
   */
  @Get('mias')
  @Autenticado()
  mias(@Yo() yo: UsuarioActual) {
    return this.modificacion.mias(yo);
  }

  /**
   * Los invitados que el socio declaró antes, para sugerírselos al reservar (T106).
   *
   * Solo los suyos: los nombres que declaró otro socio son datos de terceros. Va antes de
   * las rutas con `:id` para que nadie lea "mis-invitados" como un id.
   */
  @Get('mis-invitados')
  @SoloSocio()
  misInvitados(@Yo() yo: UsuarioActual) {
    return this.reservas.misInvitados(yo.socioId!);
  }

  /** La grilla del día para mover esta reserva, sin contarla a ella (T87). */
  @Get(':id/grilla')
  @Autenticado()
  grillaParaMover(
    @Yo() yo: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
    @Query('fecha') fecha: string | undefined,
    @Query('duracion') duracion: string | undefined,
  ) {
    return this.modificacion.grillaParaMover(
      id,
      yo,
      fechaDeConsulta(fecha),
      leerDuracion(duracion),
    );
  }

  /** Mover la hora. De quién es la reserva lo decide el servicio. */
  @Patch(':id')
  @Autenticado()
  mover(
    @Yo() yo: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.modificacion.modificar(id, destinoDeCuerpo(cuerpo), yo);
  }

  @Delete(':id')
  @Autenticado()
  cancelar(@Yo() yo: UsuarioActual, @Param('id', ParseIntPipe) id: number) {
    return this.modificacion.cancelar(id, yo);
  }
}
