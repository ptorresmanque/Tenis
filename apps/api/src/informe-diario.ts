// Como main.ts: el .env de la app, que en el servidor es un symlink al del ambiente. Antes
// de los imports, por si alguno lee una variable al cargarse.
process.loadEnvFile(`${__dirname}/../.env`);

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { InformeDiario } from './reportes/informe-diario.service';

/**
 * Una corrida del informe diario de reservas (T275), para el cron de cPanel de cada hora:
 *
 *   npm run informe-diario -w apps/api
 *
 * Como `recordatorios.ts`: levanta el contexto de Nest **sin servidor HTTP**, corre una vez y
 * sale. Manda el informe de hoy solo si está activo, si en el reloj del club ya es la hora de
 * Configuración y si hoy todavía no salió. La línea de cron está en
 * `tasks/plan-despliegue.md` § D11.
 *
 * Sale con 0 si la corrida terminó —aunque no le tocara mandar— y con 1 si no pudo, por
 * ejemplo con la base caída. Cada corrida deja una línea en el log.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const resultado = await app.get(InformeDiario).correrTanda();
    const detalle =
      resultado.estado === 'enviado'
        ? `enviado a ${resultado.destinatarios}`
        : resultado.estado;

    console.log(`${new Date().toISOString()} Informe diario: ${detalle}.`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      `${new Date().toISOString()} Informe diario: no corrió. ` +
        (error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  });
}
