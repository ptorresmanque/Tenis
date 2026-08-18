import { Module } from '@nestjs/common';

import { PasarelaFake } from './adaptadores/pasarela.fake';
import { PagosService } from './pagos.service';
import { PasarelaPago } from './pasarela.port';

/**
 * El adaptador se elige acá y en ningún otro lado. En T17 esta línea pasa a apuntar
 * al de Webpay y ni `PagosService` ni sus tests cambian: esa es la prueba de que el
 * puerto sirve (`SPEC-pagos.md` § Success Criteria, 8).
 */
@Module({
  providers: [PagosService, { provide: PasarelaPago, useClass: PasarelaFake }],
  exports: [PagosService, PasarelaPago],
})
export class PagosModule {}
