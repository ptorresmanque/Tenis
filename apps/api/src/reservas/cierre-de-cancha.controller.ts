import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { leerBloqueo } from '../catalogo-canchas/admin.dto';
import { SoloAdmin } from '../identidad/guards';
import { CierreDeCanchaService } from './cierre-de-cancha.service';

/**
 * Cerrar una cancha desde el panel, con lo que haya debajo.
 *
 * Ruta propia y no `POST /admin/bloqueos`, que sigue siendo de `catalogo-canchas`:
 * son dos operaciones distintas y la diferencia importa. Aquella crea un bloqueo y
 * nada más; esta puede cancelarle la hora a alguien, devolverle plata y mandarle un
 * correo. Compartir ruta escondería eso detrás de un mismo botón.
 *
 * El cuerpo es idéntico —lo lee el mismo `leerBloqueo`— para que el panel pueda
 * mandar el mismo formulario a cualquiera de las dos.
 */
@Controller('admin/cierres')
@SoloAdmin()
export class CierreDeCanchaController {
  constructor(private readonly cierres: CierreDeCanchaService) {}

  /**
   * A quién afectaría, sin escribir nada.
   *
   * `POST` y no `GET` porque el cuerpo es el mismo formulario del cierre; 200 y no
   * 201 porque no crea nada, que es justamente lo que hay que poder confiar acá.
   */
  @Post('simulacion')
  @HttpCode(200)
  async simular(@Body() cuerpo: unknown) {
    return { afectadas: await this.cierres.afectadas(leerBloqueo(cuerpo)) };
  }

  @Post()
  cerrar(@Body() cuerpo: unknown) {
    return this.cierres.cerrar(leerBloqueo(cuerpo));
  }
}
