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
import { InvitacionesController } from './socios/invitaciones.controller';
import { InvitacionesService } from './socios/invitaciones.service';
import { YoController } from './yo.controller';

@Module({
  controllers: [
    RegistroController,
    SesionController,
    GoogleController,
    YoController,
    InvitacionesController,
  ],
  providers: [
    RegistroService,
    SesionService,
    InvitacionesService,
    IntentosFallidos,
    GoogleService,
    { provide: ProveedorGoogle, useClass: GoogleOAuth },
    { provide: EnviadorCorreo, useClass: EnviadorPorConsola },
  ],
  // Lo consumirán los guards de T8 y todo módulo que necesite saber quién mira.
  exports: [SesionService],
})
export class IdentidadModule {}
