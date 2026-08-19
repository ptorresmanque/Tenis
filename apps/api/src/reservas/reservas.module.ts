import { Module } from '@nestjs/common';

import { CatalogoCanchasModule } from '../catalogo-canchas/catalogo-canchas.module';
import { IdentidadModule } from '../identidad/identidad.module';
import { ReservaRepository } from './reserva.repository';
import { ReservasController } from './reservas.controller';
import { ReservasService } from './reservas.service';

/**
 * `reservas` junta a los otros tres módulos: `catalogo-canchas` dice qué bloques
 * existen y cuánto valen, `identidad` quién mira, `pagos` cobra. El pago entra en
 * T23, con la reserva del no-socio.
 */
@Module({
  imports: [CatalogoCanchasModule, IdentidadModule],
  controllers: [ReservasController],
  providers: [ReservaRepository, ReservasService],
  exports: [ReservaRepository, ReservasService],
})
export class ReservasModule {}
