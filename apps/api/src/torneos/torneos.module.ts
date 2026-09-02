import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { CatalogoCanchasModule } from '../catalogo-canchas/catalogo-canchas.module';
import { PagosModule } from '../pagos/pagos.module';
import { ReservasModule } from '../reservas/reservas.module';
import { CategoriasDelTorneo } from './categorias-del-torneo.service';
import { ComprobantesDeInscripcion } from './comprobantes.service';
import { PagoDeInscripcion } from './pago-de-inscripcion.service';
import { ProgramacionDePartidos } from './programacion.service';
import { FotosDelTorneo } from './fotos.service';
import { Transmisiones } from './transmisiones.service';
import { CategoriasDeJuego } from './categorias-juego.service';
import { CuadroDelTorneo } from './cuadro.service';
import { InscripcionesAbandonadas } from './inscripciones-abandonadas.service';
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
  imports: [
    IdentidadModule,
    PagosModule,
    CatalogoCanchasModule,
    ReservasModule,
  ],
  controllers: [TorneosController, TorneosPublicosController],
  providers: [
    Jugadores,
    Torneos,
    CategoriasDeJuego,
    CategoriasDelTorneo,
    ComprobantesDeInscripcion,
    PagoDeInscripcion,
    ProgramacionDePartidos,
    Transmisiones,
    FotosDelTorneo,
    InscripcionesAbandonadas,
    InscripcionesATorneo,
    CuadroDelTorneo,
    ResultadosDelCuadro,
    TorneosPublicos,
  ],
  exports: [Jugadores],
})
export class TorneosModule {}
