import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { CarritoController } from './carrito.controller';
import { CarritoDeLaTienda } from './carrito.service';
import { CatalogoAdminController } from './catalogo-admin.controller';
import { CategoriasYMarcas } from './catalogo-admin.service';
import { CatalogoPublicoController } from './catalogo-publico.controller';
import { CatalogoPublico } from './catalogo-publico.service';
import { FotosPublicasController } from './fotos-publicas.controller';
import { FotosDeProductos } from './fotos.service';
import { InterruptorDeLaTienda, RUTAS_DE_LA_TIENDA } from './interruptor';
import { MovimientosDeStock } from './movimientos.service';
import { PedidosController } from './pedidos.controller';
import { PedidosDeLaTienda } from './pedidos.service';
import { ProductosAdminController } from './productos-admin.controller';
import { ProductosDeLaTienda } from './productos.service';
import { StockAdminController } from './stock-admin.controller';

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
  controllers: [
    CatalogoAdminController,
    ProductosAdminController,
    FotosPublicasController,
    StockAdminController,
    CatalogoPublicoController,
    CarritoController,
    PedidosController,
  ],
  providers: [
    CategoriasYMarcas,
    ProductosDeLaTienda,
    FotosDeProductos,
    MovimientosDeStock,
    CatalogoPublico,
    CarritoDeLaTienda,
    PedidosDeLaTienda,
  ],
})
export class TiendaModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(InterruptorDeLaTienda).forRoutes(...RUTAS_DE_LA_TIENDA);
  }
}
