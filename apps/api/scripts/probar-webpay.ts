/**
 * Ciclo completo contra el ambiente de integración de Transbank, a mano.
 *
 *   npm run webpay -w apps/api            → abre Webpay y espera el pago
 *   npm run webpay -w apps/api -- 25000   → con otro monto
 *
 * Tarjetas de prueba y clave del banco simulado están en la documentación pública
 * de Transbank. Acá no se guarda ninguna.
 *
 * **Por qué levanta un servidor.** Webpay no termina de autorizar cuando la persona
 * aprieta "pagar": hace un POST a la URL de retorno y recién ahí el comercio
 * confirma. Sin nadie escuchando, Transbank responde `Invalid status '10' ... commerce
 * will be notified by webpay to authorize` y quien pagó ve "la transacción no pudo
 * realizarse". Este servidor efímero hace de comercio hasta que exista el de T23.
 */
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer, IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  WebpayAdapter,
  webpayDesdeEntorno,
} from '../src/pagos/adaptadores/webpay.adapter';

const PUERTO = 3099;
const adaptador = new WebpayAdapter(webpayDesdeEntorno());

async function main() {
  // `confirmar <token>` cierra a mano una transacción que quedó a medio camino: pasa
  // cuando la vuelta de Webpay no llega a este servidor. Transbank la deja esperando
  // la confirmación, no anulada.
  if (process.argv[2] === 'confirmar') {
    const token = process.argv[3];
    if (!token) throw new Error('Falta el token.');
    console.log(await adaptador.confirmar(token));
    return;
  }

  const montoClp = Number(process.argv[2] ?? 12000);
  const referencia = `manual${Date.now()}`;

  const servidor = createServer((peticion, respuesta) => {
    void (async () => {
      // **Webpay vuelve por GET, con el token en la query.** Estaba escrito como POST
      // —así lo describe media documentación— y las cuatro peticiones que llegaban se
      // descartaban en silencio. Se aceptan las dos formas: la del cuerpo y la de la
      // URL, porque el método de la vuelta depende de cómo esté configurado el
      // comercio y no es algo que controlemos.
      const enLaUrl = new URL(peticion.url ?? '/', 'http://localhost').searchParams;
      const enElCuerpo = new URLSearchParams(await leerCuerpo(peticion));
      const campo = (nombre: string) =>
        enLaUrl.get(nombre) ?? enElCuerpo.get(nombre);
      const token = campo('token_ws');

      // Qué llegó, siempre. La primera versión trataba cualquier petición como la
      // vuelta de Webpay y anunciaba "pago anulado" cinco veces seguidas sin decir de
      // dónde salían: es el mismo error de diagnóstico que costó un intento en T7.
      const campos = [...enLaUrl.keys(), ...enElCuerpo.keys()];
      console.log(
        `← ${peticion.method} ${peticion.url?.split('?')[0]} campos: [${campos.join(', ') || 'ninguno'}]`,
      );

      if (!token) {
        if (campo('TBK_TOKEN')) {
          console.log('\nEl pago se anuló en Webpay. No hay nada que confirmar.');
          responder(respuesta, 'Pago anulado. Podés cerrar esta pestaña.');
          return terminar(servidor, 1);
        }

        // El navegador pide favicons y otras cosas al mismo puerto. No es el retorno,
        // y darlo por anulado corta la espera justo antes de que llegue el bueno.
        respuesta.writeHead(404).end();
        return;
      }

      try {
        const resultado = await adaptador.confirmar(token);
        console.log('\nResultado traducido:');
        console.log(resultado);
        responder(
          respuesta,
          `Pago ${resultado.estado}. Volvé a la terminal para ver el detalle.`,
        );
        terminar(servidor, resultado.estado === 'AUTORIZADA' ? 0 : 0);
      } catch (error) {
        console.error('\nTransbank rechazó la confirmación:');
        console.error(error instanceof Error ? error.message : error);
        responder(respuesta, 'La confirmación falló. Mirá la terminal.');
        terminar(servidor, 1);
      }
    })();
  });

  await new Promise<void>((listo) => servidor.listen(PUERTO, listo));

  const inicio = await adaptador.iniciar({
    referencia,
    montoClp,
    urlRetorno: `http://localhost:${PUERTO}/retorno`,
  });

  console.log(`referencia: ${referencia}`);
  console.log(`monto:      $${montoClp.toLocaleString('es-CL')}`);
  console.log(`token:      ${inicio.tokenPasarela}`);
  console.log('\nAbriendo Webpay. Esperando el pago…');

  abrirFormulario(inicio.urlRedireccion, inicio.tokenPasarela);
}

const leerCuerpo = async (peticion: IncomingMessage): Promise<string> => {
  let cuerpo = '';
  for await (const trozo of peticion) cuerpo += trozo;
  return cuerpo;
};

function responder(respuesta: import('node:http').ServerResponse, texto: string) {
  respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  respuesta.end(`<!doctype html><meta charset="utf-8"><p>${texto}</p>`);
}

function terminar(servidor: import('node:http').Server, codigo: number) {
  // Un respiro para que el navegador alcance a recibir la respuesta.
  setTimeout(() => {
    servidor.close();
    process.exit(codigo);
  }, 500);
}

/**
 * Abre Webpay en el navegador del sistema.
 *
 * No se puede abrir la URL a secas: Webpay espera un POST con `token_ws` y un GET
 * responde 404. Va un HTML de un solo uso que hace ese POST y se envía solo.
 */
function abrirFormulario(url: string, token: string): void {
  const archivo = join(tmpdir(), `webpay-${token.slice(0, 8)}.html`);

  writeFileSync(
    archivo,
    `<!doctype html><meta charset="utf-8"><title>Abriendo Webpay…</title>
<body onload="document.forms[0].submit()">
<form method="POST" action="${url}">
  <input type="hidden" name="token_ws" value="${token}">
  <button>Ir a pagar</button>
</form>`,
  );

  execFile('open', [archivo], (error) => {
    if (error) console.log(`Abrilo a mano: ${archivo}`);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
