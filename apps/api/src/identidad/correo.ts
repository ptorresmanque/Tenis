import { spawn } from 'node:child_process';

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
 * Manda el correo y, si no sale, lo deja en el log en vez de fallar.
 *
 * Para los correos que se mandan con el trabajo ya hecho: una falla de sendmail no
 * puede deshacer una cuenta creada ni una cancelación, y responder error diría que no
 * ocurrieron. Donde nadie espera el envío, además evita un rechazo sin manejar, que
 * botaría el proceso. `siFalla` es lo que necesita quien lea el log para actuar.
 */
export async function enviarOAnotar(
  enviador: EnviadorCorreo,
  correo: CorreoSaliente,
  log: Logger,
  siFalla = `No salió "${correo.asunto}" para ${correo.para}`,
): Promise<void> {
  try {
    await enviador.enviar(correo);
  } catch (falla) {
    log.error(`${siFalla}: ${String(falla)}`);
  }
}

/**
 * Adaptador de desarrollo y de los tests: escribe el correo en el log del servidor.
 * Es el que se usa cuando el `.env` no trae CORREO_REMITENTE.
 */
@Injectable()
export class EnviadorPorConsola extends EnviadorCorreo {
  private readonly log = new Logger('Correo');

  enviar(correo: CorreoSaliente): Promise<void> {
    this.log.log(`Para: ${correo.para} — ${correo.asunto}\n${correo.cuerpo}`);
    return Promise.resolve();
  }
}

/** Base64 en líneas de 76, como pide RFC 2045 para el cuerpo de un mensaje. */
function base64(texto: string): string {
  return Buffer.from(texto, 'utf8')
    .toString('base64')
    .replace(/.{76}/g, '$&\n');
}

/**
 * El mensaje que recibe sendmail. Asunto y cuerpo van en base64 y UTF-8: así las tildes
 * y la ñ llegan intactas, sin depender de que cada servidor del camino acepte 8 bits.
 *
 * ponytail: el asunto va en una sola palabra codificada aunque pase de los 75
 * caracteres que pide RFC 2047; Gmail y Outlook la leen igual. Si algún cliente la
 * corta, partirla en trozos de 45 bytes.
 */
export function armarMensaje(
  correo: CorreoSaliente,
  remitente: string,
): string {
  // Un salto de línea en un encabezado agrega otro: un "Bcc:" colado manda copia a
  // quien sea. Los correos de la app ya vienen validados; esto es la última barrera.
  if (/[\r\n]/.test(correo.para + correo.asunto + remitente)) {
    throw new Error('Un encabezado del correo trae un salto de línea.');
  }

  return [
    `From: ${remitente}`,
    `To: ${correo.para}`,
    `Subject: =?UTF-8?B?${Buffer.from(correo.asunto, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64(correo.cuerpo),
  ].join('\n');
}

/**
 * Adaptador del hosting: le entrega el correo al sendmail del servidor
 * (`/usr/sbin/sendmail`, en la ficha del servidor). Exim lo firma con el DKIM de
 * fedal.cl (plan § 0.6), sin una dependencia nueva ni credenciales SMTP en el `.env`.
 *
 * `-t` toma el destinatario del encabezado `To`, `-i` evita que una línea con solo un
 * punto corte el mensaje y `-f` pone al remitente como dirección de rebote.
 *
 * Diez segundos de `espera` sobran: Exim deja el mensaje en su cola y vuelve al tiro.
 */
export class EnviadorPorSendmail extends EnviadorCorreo {
  constructor(
    private readonly remitente: string,
    private readonly sendmail = '/usr/sbin/sendmail',
    private readonly espera = 10_000,
  ) {
    super();
  }

  enviar(correo: CorreoSaliente): Promise<void> {
    const mensaje = armarMensaje(correo, this.remitente);
    const rebote = /<([^>]+)>/.exec(this.remitente)?.[1] ?? this.remitente;

    return new Promise((resolver, rechazar) => {
      // `timeout` lo mata con SIGTERM si no termina: colgado, dejaría esperando
      // para siempre a quien envía.
      const proceso = spawn(this.sendmail, ['-t', '-i', '-f', rebote], {
        stdio: ['pipe', 'ignore', 'pipe'],
        timeout: this.espera,
      });
      let error = '';
      proceso.stderr.on('data', (trozo: Buffer) => (error += trozo.toString()));
      proceso.on('error', rechazar);
      // Si sendmail sale sin leer, la escritura da EPIPE. Sin quien lo escuche, es una
      // excepción sin manejar y bota la API entera.
      proceso.stdin.on('error', rechazar);
      // El éxito se decide al salir sendmail, no al cerrarse sus salidas: Exim entrega
      // desde un hijo que puede heredarlas, y esperarlo sería esperar la entrega
      // entera. La falla sí espera el cierre, para llevar todo lo que dijo.
      proceso.on('exit', (codigo) => {
        if (codigo === 0) resolver();
      });
      proceso.on('close', (codigo, senal) => {
        if (codigo !== 0) {
          rechazar(
            new Error(`sendmail salió con ${codigo ?? senal}: ${error.trim()}`),
          );
        }
      });
      proceso.stdin.end(mensaje);
    });
  }
}

/** Con CORREO_REMITENTE en el `.env`, el correo sale de verdad; sin él, va al log. */
export function elegirEnviador(env: NodeJS.ProcessEnv): EnviadorCorreo {
  return env.CORREO_REMITENTE
    ? new EnviadorPorSendmail(env.CORREO_REMITENTE)
    : new EnviadorPorConsola();
}
