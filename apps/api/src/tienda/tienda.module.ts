import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { CatalogoAdminController } from './catalogo-admin.controller';
import { CategoriasYMarcas } from './catalogo-admin.service';
import { InterruptorDeLaTienda, RUTAS_DE_LA_TIENDA } from './interruptor';

/**
 * La tienda: la Etapa 2, fuera del trabajo de título (`SPEC-tienda.md`).
 *
 * Todo lo suyo pasa por el interruptor: sin `TIENDA_HABILITADA`, cada ruta bajo
 * `tienda/` y `admin/tienda/` responde 404 (T156).
 */
@Module({
  // `IdentidadModule` porque `@SoloAdmin()` resuelve `SesionService` en el módulo del
  // controlador que lo usa, no en el que lo declara.
  imports: [IdentidadModule],
  controllers: [CatalogoAdminController],
  providers: [CategoriasYMarcas],
})
export class TiendaModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(InterruptorDeLaTienda).forRoutes(...RUTAS_DE_LA_TIENDA);
  }
}
