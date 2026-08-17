import { Injectable, Logger } from '@nestjs/common';

export interface CorreoSaliente {
  para: string;
  asunto: string;
  cuerpo: string;
}

/**
 * Puerto de salida de correo. El mismo trato que `PasarelaPago` en SPEC-pagos.md:
 * el servicio depende de la interfaz y el adaptador se elige en el módulo, así los
 * tests no dependen de un servidor SMTP ni mandan correo a nadie de verdad.
 */
@Injectable()
export abstract class EnviadorCorreo {
  abstract enviar(correo: CorreoSaliente): Promise<void>;
}

/**
 * Adaptador de desarrollo: escribe el correo en el log del servidor.
 *
 * El club no tiene todavía proveedor de correo ni dominio verificado. Cuando lo
 * tenga, el adaptador real entra por acá y ni el servicio ni sus tests cambian.
 */
@Injectable()
export class EnviadorPorConsola extends EnviadorCorreo {
  private readonly log = new Logger('Correo');

  enviar(correo: CorreoSaliente): Promise<void> {
    this.log.log(`Para: ${correo.para} — ${correo.asunto}\n${correo.cuerpo}`);
    return Promise.resolve();
  }
}
