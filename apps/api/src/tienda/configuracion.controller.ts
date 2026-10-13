import { Body, Controller, Get, Patch } from '@nestjs/common';

import { SoloAdmin } from '../identidad/guards';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfiguracionDeLaTienda,
  leerConfiguracion,
} from './configuracion.dto';

const CAMPOS = {
  descuentoSocioPorcentaje: true,
  umbralStockBajo: true,
  arriendoRaquetasTexto: true,
} as const;

/**
 * La configuración de la tienda, en su pestaña del panel (T172, `SPEC-tienda.md` § Panel):
 * el descuento de socio, el umbral de stock bajo y el texto del arriendo de raquetas. Viven
 * en la fila única de `ConfiguracionClub`, pero bajo `admin/tienda/`: el interruptor las
 * cubre, y la configuración de la tesis no las ve.
 *
 * **Cambiar el descuento cambia lo que viene, no lo ya vendido**: el precio y el descuento
 * se congelan en cada línea al crear el pedido (T164).
 */
@Controller('admin/tienda/configuracion')
@SoloAdmin()
export class ConfiguracionDeLaTiendaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  leer(): Promise<ConfiguracionDeLaTienda> {
    return this.prisma.configuracionClub.findFirstOrThrow({ select: CAMPOS });
  }

  @Patch()
  async cambiar(@Body() cuerpo: unknown): Promise<ConfiguracionDeLaTienda> {
    const cambio = leerConfiguracion(cuerpo);
    const { id } = await this.prisma.configuracionClub.findFirstOrThrow({
      select: { id: true },
    });

    return this.prisma.configuracionClub.update({
      where: { id },
      data: cambio,
      select: CAMPOS,
    });
  }
}
