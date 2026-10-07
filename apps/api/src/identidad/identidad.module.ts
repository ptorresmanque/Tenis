import { Module } from '@nestjs/common';

import { EnviadorCorreo, EnviadorPorConsola } from './correo';
import { GoogleController } from './google/google.controller';
import { GoogleOAuth } from './google/google.oauth';
import { ProveedorGoogle } from './google/google.port';
import { GoogleService } from './google/google.service';
import { RecuperacionController } from './recuperacion.controller';
import { RecuperacionService } from './recuperacion.service';
import { RegistroController } from './registro.controller';
import { RegistroService } from './registro.service';
import { SesionController } from './sesion/sesion.controller';
import { AdministradoresController } from './admin/administradores.controller';
import { IntentosFallidos } from './intentos';
import { SesionService } from './sesion/sesion.service';
import { InvitacionesController } from './socios/invitaciones.controller';
import {
  ContactoPublicoController,
  SolicitudesController,
} from './contacto/contacto.controller';
import { ContactoService } from './contacto/contacto.service';
import { DirectorioController } from './socios/directorio.controller';
import { CambiosDeSocio } from './socios/cambios.service';
import { FichaDeSocioService } from './socios/ficha.service';
import { InvitacionesService } from './socios/invitaciones.service';
import { YoController } from './yo.controller';

@Module({
  controllers: [
    ContactoPublicoController,
    SolicitudesController,
    RegistroController,
    RecuperacionController,
    SesionController,
    GoogleController,
    YoController,
    InvitacionesController,
    AdministradoresController,
    DirectorioController,
  ],
  providers: [
    ContactoService,
    CambiosDeSocio,
    FichaDeSocioService,
    RegistroService,
    RecuperacionService,
    SesionService,
    InvitacionesService,
    IntentosFallidos,
    GoogleService,
    { provide: ProveedorGoogle, useClass: GoogleOAuth },
    { provide: EnviadorCorreo, useClass: EnviadorPorConsola },
  ],
  // Lo consumirán los guards de T8 y todo módulo que necesite saber quién mira.
  // `EnviadorCorreo` sale del módulo porque `reservas` avisa cancelaciones (T36).
  // Es el puerto, no el adaptador: quien lo importa no sabe si escribe en el log o
  // manda un correo de verdad.
  // `IntentosFallidos` se exporta para que `torneos` frene su formulario público con
  // el mismo contador (T64). **Una sola instancia y no una por módulo**: las llaves ya
  // separan las superficies —`login|`, `contacto|`, `inscripcion|`— y la poda de
  // memoria que la protege de llenarse está pensada sobre un único mapa.
  exports: [SesionService, EnviadorCorreo, CambiosDeSocio, IntentosFallidos],
})
export class IdentidadModule {}
