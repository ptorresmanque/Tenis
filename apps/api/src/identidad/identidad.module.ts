import { Module } from '@nestjs/common';

import { EnviadorCorreo, EnviadorPorConsola } from './correo';
import { RegistroController } from './registro.controller';
import { RegistroService } from './registro.service';
import { SesionController } from './sesion/sesion.controller';
import { SesionService } from './sesion/sesion.service';

@Module({
  controllers: [RegistroController, SesionController],
  providers: [
    RegistroService,
    SesionService,
    { provide: EnviadorCorreo, useClass: EnviadorPorConsola },
  ],
  // Lo consumirán los guards de T8 y todo módulo que necesite saber quién mira.
  exports: [SesionService],
})
export class IdentidadModule {}
