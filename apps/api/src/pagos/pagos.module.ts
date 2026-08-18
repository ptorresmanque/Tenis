import { Module } from '@nestjs/common';

import { PasarelaFake } from './adaptadores/pasarela.fake';
import {
  WebpayAdapter,
  webpayDesdeEntorno,
} from './adaptadores/webpay.adapter';
import { PagosService } from './pagos.service';
import { PasarelaPago } from './pasarela.port';

/**
 * El adaptador se elige acá y en ningún otro lado. Que esta sea la única línea que
 * cambia entre cobrar de verdad y cobrar de mentira es la prueba de que el puerto
 * sirve (`SPEC-pagos.md` § Success Criteria, 8).
 *
 * Por defecto, Webpay contra el ambiente de integración. `PAGOS_PASARELA=doble` lo
 * reemplaza por el falso: es la salida si Transbank está caído el día de la demo,
 * que es un riesgo listado en `tasks/plan.md` y que no depende de nosotros.
 */
@Module({
  providers: [
    PagosService,
    {
      provide: PasarelaPago,
      // Factory y no `useClass`: la transacción de Webpay se arma acá, y con el doble
      // no se construye ninguna — no hay por qué configurar una conexión a Transbank
      // para correr sin él.
      useFactory: (): PasarelaPago =>
        process.env.PAGOS_PASARELA === 'doble'
          ? new PasarelaFake()
          : new WebpayAdapter(webpayDesdeEntorno()),
    },
  ],
  exports: [PagosService, PasarelaPago],
})
export class PagosModule {}
