import { Module } from '@nestjs/common';

import { ReservaRepository } from './reserva.repository';

/**
 * `reservas` junta a los otros tres módulos: `catalogo-canchas` dice qué bloques
 * existen, `identidad` quién mira, `pagos` cobra. Por ahora solo el repositorio; los
 * servicios de cupo y de reserva llegan en T22 y T23.
 */
@Module({
  providers: [ReservaRepository],
  exports: [ReservaRepository],
})
export class ReservasModule {}
