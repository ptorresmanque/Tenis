import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { CuadroDelTorneo } from './cuadro.service';
import { InscripcionesATorneo } from './inscripciones.service';
import { ResultadosDelCuadro } from './resultados.service';
import { TorneosPublicosController } from './torneos-publicos.controller';
import { TorneosPublicos } from './torneos-publicos.service';
import { Jugadores } from './jugadores.service';
import { TorneosController } from './torneos.controller';
import { Torneos } from './torneos.service';

/**
 * Los torneos del club.
 *
 * `IdentidadModule` porque `@SoloAdmin()` resuelve `SesionService` en el módulo del
 * controlador que lo usa. Lee `Socio` para armar el jugador de un socio, y nada más:
 * los puntos y los partidos cuelgan del jugador.
 */
@Module({
  imports: [IdentidadModule],
  controllers: [TorneosController, TorneosPublicosController],
  providers: [
    Jugadores,
    Torneos,
    InscripcionesATorneo,
    CuadroDelTorneo,
    ResultadosDelCuadro,
    TorneosPublicos,
  ],
  exports: [Jugadores],
})
export class TorneosModule {}
