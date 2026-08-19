import { Module } from '@nestjs/common';

import { CatalogoCanchasModule } from '../catalogo-canchas/catalogo-canchas.module';
import { IdentidadModule } from '../identidad/identidad.module';
import { PagosModule } from '../pagos/pagos.module';
import { DisponibilidadPublicaController } from './disponibilidad-publica.controller';
import { DisponibilidadPublicaService } from './disponibilidad-publica.service';
import { ModificacionService } from './modificacion.service';
import { NoSocioController } from './no-socio.controller';
import { ReservaNoSocioService } from './reserva-no-socio.service';
import { ReservaRepository } from './reserva.repository';
import { ReservasController } from './reservas.controller';
import { ReservasService } from './reservas.service';

/**
 * `reservas` junta a los otros tres módulos: `catalogo-canchas` dice qué bloques
 * existen y cuánto valen, `identidad` quién mira, `pagos` cobra. El pago entra en
 * T23, con la reserva del no-socio.
 */
@Module({
  imports: [CatalogoCanchasModule, IdentidadModule, PagosModule],
  controllers: [
    ReservasController,
    NoSocioController,
    DisponibilidadPublicaController,
  ],
  providers: [
    ReservaRepository,
    ReservasService,
    ReservaNoSocioService,
    ModificacionService,
    DisponibilidadPublicaService,
  ],
  exports: [
    ReservaRepository,
    ReservasService,
    ModificacionService,
    DisponibilidadPublicaService,
  ],
})
export class ReservasModule {}
