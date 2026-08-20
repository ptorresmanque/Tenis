import { Module } from '@nestjs/common';

import { EnviadorCorreo, EnviadorPorConsola } from './correo';
import { GoogleController } from './google/google.controller';
import { GoogleOAuth } from './google/google.oauth';
import { ProveedorGoogle } from './google/google.port';
import { GoogleService } from './google/google.service';
import { RegistroController } from './registro.controller';
import { RegistroService } from './registro.service';
import { SesionController } from './sesion/sesion.controller';
import { IntentosFallidos } from './intentos';
import { SesionService } from './sesion/sesion.service';
import { YoController } from './yo.controller';

@Module({
  controllers: [
    RegistroController,
    SesionController,
    GoogleController,
    YoController,
  ],
  providers: [
    RegistroService,
    SesionService,
    IntentosFallidos,
    GoogleService,
    { provide: ProveedorGoogle, useClass: GoogleOAuth },
    { provide: EnviadorCorreo, useClass: EnviadorPorConsola },
  ],
  // Lo consumirán los guards de T8 y todo módulo que necesite saber quién mira.
  exports: [SesionService],
})
export class IdentidadModule {}
