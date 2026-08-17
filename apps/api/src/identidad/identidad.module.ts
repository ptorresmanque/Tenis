import { Module } from '@nestjs/common';

import { EnviadorCorreo, EnviadorPorConsola } from './correo';
import { RegistroController } from './registro.controller';
import { RegistroService } from './registro.service';

@Module({
  controllers: [RegistroController],
  providers: [
    RegistroService,
    { provide: EnviadorCorreo, useClass: EnviadorPorConsola },
  ],
})
export class IdentidadModule {}
