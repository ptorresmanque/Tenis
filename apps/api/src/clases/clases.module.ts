import { Module } from '@nestjs/common';

import { CatalogoCanchasModule } from '../catalogo-canchas/catalogo-canchas.module';
import { IdentidadModule } from '../identidad/identidad.module';
import { ReservasModule } from '../reservas/reservas.module';
import { ClasesController } from './clases.controller';
import { Clases } from './clases.service';
import { ProfesoresController } from './profesores.controller';
import { Profesores } from './profesores.service';

/**
 * Las clases con profesor que da el club.
 *
 * Depende de `catalogo-canchas` —para saber si esa hora existe en la grilla— y de
 * `reservas` —para la cascada de T36, que es la que le avisa al socio al que la clase
 * le quita la hora—. Ninguno de los dos depende de `clases`, así que el mapa sigue
 * sin ciclos: la agenda del día junta clases y reservas **en la pantalla**, que es
 * donde el club las mira juntas, y no en un servicio que tendría que conocer las dos.
 *
 * `IdentidadModule` porque `@SoloAdmin()` resuelve `SesionService` en el módulo del
 * controlador que lo usa, no en el que lo declara.
 */
@Module({
  imports: [IdentidadModule, CatalogoCanchasModule, ReservasModule],
  controllers: [ProfesoresController, ClasesController],
  providers: [Profesores, Clases],
})
export class ClasesModule {}
