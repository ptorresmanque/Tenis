import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  armarMensaje,
  CorreoSaliente,
  elegirEnviador,
  EnviadorPorConsola,
  EnviadorPorSendmail,
} from './correo';

/**
 * D5 (tasks/plan-despliegue.md). En el hosting, el correo sale por el sendmail del
 * servidor, y Exim lo firma con el DKIM de fedal.cl. Sin CORREO_REMITENTE se sigue
 * escribiendo en el log, como en desarrollo y en los tests.
 */
describe('Correo saliente', () => {
  const REMITENTE = 'FEDAL Tennis Center <no-responder@fedal.cl>';
  const CORREO: CorreoSaliente = {
    para: 'socia@ejemplo.cl',
    asunto: 'Verifica tu correo — FEDAL Tennis Center',
    cuerpo: 'Hola Ñuñoa,\n\nAbre este enlace para terminar tu inscripción.\n',
  };

  /** Lo que lee un cliente de correo: el encabezado pedido y el cuerpo, decodificados. */
  function leer(mensaje: string) {
    const [cabecera, cuerpo] = mensaje.split('\n\n');
    const encabezado = (nombre: string) =>
      new RegExp(`^${nombre}: (.*)$`, 'm').exec(cabecera)?.[1];
    const asunto = /^=\?UTF-8\?B\?(.+)\?=$/.exec(
      encabezado('Subject') ?? '',
    )?.[1];

    return {
      encabezado,
      asunto: Buffer.from(asunto ?? '', 'base64').toString('utf8'),
      cuerpo: Buffer.from(cuerpo.replace(/\n/g, ''), 'base64').toString('utf8'),
      lineas: mensaje.split('\n'),
    };
  }

  /** Un sendmail que guarda sus argumentos y lo que recibe, y sale con `salida`. */
  function sendmailFalso(salida = 0): { ruta: string; carpeta: string } {
    const carpeta = mkdtempSync(join(tmpdir(), 'sendmail-'));
    const ruta = join(carpeta, 'sendmail');
    writeFileSync(
      ruta,
      `#!/bin/sh\nprintf '%s\\n' "$@" > "${carpeta}/argumentos"\n` +
        `cat > "${carpeta}/mensaje"\n` +
        `[ ${salida} -eq 0 ] || echo "no hay ruta al destino" >&2\nexit ${salida}\n`,
    );
    chmodSync(ruta, 0o755);
    return { ruta, carpeta };
  }

  it('arma un mensaje con el asunto y el cuerpo en UTF-8, tildes incluidas', () => {
    const mensaje = leer(armarMensaje(CORREO, REMITENTE));

    expect(mensaje.encabezado('From')).toBe(REMITENTE);
    expect(mensaje.encabezado('To')).toBe('socia@ejemplo.cl');
    expect(mensaje.asunto).toBe('Verifica tu correo — FEDAL Tennis Center');
    expect(mensaje.encabezado('Content-Type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(mensaje.cuerpo).toBe(CORREO.cuerpo);
  });

  it('ninguna línea del mensaje pasa de 76 caracteres', () => {
    const largo = { ...CORREO, cuerpo: 'Tenis en arcilla. '.repeat(40) };

    const lineas = leer(armarMensaje(largo, REMITENTE)).lineas.filter(
      (linea) => !linea.startsWith('Subject:'),
    );

    expect(
      Math.max(...lineas.map((linea) => linea.length)),
    ).toBeLessThanOrEqual(76);
  });

  it.each([
    ['el destinatario', { para: 'socia@ejemplo.cl\nBcc: todos@ejemplo.cl' }],
    ['el asunto', { asunto: 'Hola\r\nBcc: todos@ejemplo.cl' }],
  ])(
    'rechaza un salto de línea en %s, que inyectaría encabezados',
    (_campo, cambio) => {
      expect(() => armarMensaje({ ...CORREO, ...cambio }, REMITENTE)).toThrow(
        /salto de línea/,
      );
    },
  );

  it('se lo entrega a sendmail, que toma el destinatario del mensaje', async () => {
    const { ruta, carpeta } = sendmailFalso();

    await new EnviadorPorSendmail(REMITENTE, ruta).enviar(CORREO);

    expect(readFileSync(join(carpeta, 'mensaje'), 'utf8')).toBe(
      armarMensaje(CORREO, REMITENTE),
    );
    expect(
      readFileSync(join(carpeta, 'argumentos'), 'utf8').split('\n'),
    ).toEqual(['-t', '-i', '-f', 'no-responder@fedal.cl', '']);
  });

  it('si sendmail falla, el envío falla con lo que dijo', async () => {
    const { ruta } = sendmailFalso(75);

    await expect(
      new EnviadorPorSendmail(REMITENTE, ruta).enviar(CORREO),
    ).rejects.toThrow(/sendmail salió con 75: no hay ruta al destino/);
  });

  /** Un ejecutable con el guion que se le pase, para las fallas raras. */
  function guion(contenido: string): string {
    const ruta = join(mkdtempSync(join(tmpdir(), 'sendmail-')), 'sendmail');
    writeFileSync(ruta, `#!/bin/sh\n${contenido}\n`);
    chmodSync(ruta, 0o755);
    return ruta;
  }

  it('si sendmail sale sin leer el mensaje, el envío falla sin botar el proceso', async () => {
    // Sin escuchar el error de la escritura, el EPIPE es una excepción sin manejar y
    // Node bota la API entera. Un mensaje largo lo hace pasar siempre: no cabe en el
    // buffer de la tubería y la escritura sigue cuando sendmail ya salió.
    const largo = { ...CORREO, cuerpo: 'Tenis en arcilla. '.repeat(20_000) };

    await expect(
      new EnviadorPorSendmail(REMITENTE, guion('exit 1')).enviar(largo),
    ).rejects.toThrow();
  });

  it('si sendmail no termina, se corta y el envío falla', async () => {
    // Colgado, dejaba esperando para siempre a quien enviaba: el registro no
    // respondía nunca. `exec` para que el colgado sea sendmail mismo y no un hijo.
    const colgado = guion('cat > /dev/null\nexec sleep 30');

    await expect(
      new EnviadorPorSendmail(REMITENTE, colgado, 300).enviar(CORREO),
    ).rejects.toThrow(/sendmail salió con SIGTERM/);
  });

  it('no espera a lo que sendmail deja corriendo de fondo, como la entrega de Exim', async () => {
    // Exim acepta el mensaje, sale, y entrega desde un proceso hijo. Si ese hijo
    // hereda la salida de errores, esperar a que se cierre sería esperar la entrega
    // entera en cada registro.
    const conHijo = guion('cat > /dev/null\nsleep 5 &\nexit 0');
    const inicio = Date.now();

    await new EnviadorPorSendmail(REMITENTE, conHijo).enviar(CORREO);

    expect(Date.now() - inicio).toBeLessThan(2000);
  }, 10_000);

  it('sin CORREO_REMITENTE escribe en el log; con él, envía por sendmail', () => {
    expect(elegirEnviador({})).toBeInstanceOf(EnviadorPorConsola);
    expect(elegirEnviador({ CORREO_REMITENTE: REMITENTE })).toBeInstanceOf(
      EnviadorPorSendmail,
    );
  });
});
