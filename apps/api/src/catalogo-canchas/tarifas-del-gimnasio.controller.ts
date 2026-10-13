import { Body, Controller, Put } from '@nestjs/common';

import { SoloAdmin } from '../identidad/guards';
import { PrismaService } from '../prisma/prisma.service';
import { leerTarifasDelGimnasio, TarifaDelGimnasio } from './admin.dto';

/**
 * Las tarifas del gimnasio (T235, `SPEC.md` § El gimnasio). El sitio las lee en
 * `GET /api/club`; acá solo se guardan.
 *
 * **La lista se guarda entera**, como la deja la pantalla: borrar las de antes y crear las
 * nuevas en una transacción. Así el orden es el de la pantalla, y una lista inválida —que
 * `leerTarifasDelGimnasio` rechaza antes de tocar la base— deja las anteriores como estaban.
 */
@Controller('admin/club/gimnasio/tarifas')
@SoloAdmin()
export class TarifasDelGimnasioController {
  constructor(private readonly prisma: PrismaService) {}

  @Put()
  async guardar(@Body() cuerpo: unknown): Promise<TarifaDelGimnasio[]> {
    const tarifas = leerTarifasDelGimnasio(cuerpo);

    await this.prisma.$transaction([
      this.prisma.tarifaGimnasio.deleteMany(),
      this.prisma.tarifaGimnasio.createMany({
        data: tarifas.map((tarifa, orden) => ({ ...tarifa, orden })),
      }),
    ]);

    return tarifas;
  }
}
