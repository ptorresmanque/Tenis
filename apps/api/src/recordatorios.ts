// Como main.ts: el .env de la app, que en el servidor es un symlink al del ambiente. Antes
// de los imports, por si alguno lee una variable al cargarse.
process.loadEnvFile(`${__dirname}/../.env`);

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { RecordatoriosDeCuota } from './cuotas/recordatorios';

/**
 * Una tanda de recordatorios de cuota (T111), para el cron de cPanel (T112):
 *
 *   npm run recordatorios -w apps/api
 *
 * Levanta el contexto de Nest **sin servidor HTTP**, corre una tanda y sale. La línea de
 * cron y dónde queda el log están en `tasks/plan-despliegue.md` § Recordatorios de cuota.
 *
 * Sale con código 0 si la tanda corrió —aunque no haya mandado nada— y distinto de 0 si
 * no pudo, por ejemplo con la base caída: el log lo dice, y es lo que se lee desde el
 * Administrador de archivos, porque el servidor no tiene shell.
 */
async function main(): Promise<void> {
  // Solo avisos y errores: los mensajes de cada módulo al iniciar llenarían el log de una
  // corrida por hora sin decir nada.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const { enviados, pendientes } = await app
      .get(RecordatoriosDeCuota)
      .correrTanda();

    console.log(
      `${new Date().toISOString()} Recordatorios de cuota: ${enviados} enviados, ` +
        `${pendientes} quedan para la próxima corrida.`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      `${new Date().toISOString()} Recordatorios de cuota: no corrió. ` +
        (error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  });
}
