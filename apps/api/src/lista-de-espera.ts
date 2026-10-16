// Como main.ts: el .env de la app, que en el servidor es un symlink al del ambiente. Antes
// de los imports, por si alguno lee una variable al cargarse.
process.loadEnvFile(`${__dirname}/../.env`);

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ListaDeEspera } from './torneos/lista-de-espera.service';

/**
 * Una vuelta de la lista de espera de los torneos (T335), para el cron de cPanel de cada 5
 * minutos:
 *
 *   npm run lista-de-espera -w apps/api
 *
 * Como `informe-diario.ts`: levanta el contexto de Nest **sin servidor HTTP**, corre una vez y
 * sale. Retira las ofertas vencidas sin un pago en curso, les avisa y le ofrece el cupo al
 * siguiente de la fila. Cada 5 minutos y no cada hora: con un plazo de 30 minutos, una vuelta
 * por hora dejaría el cupo esperando hasta una hora de más (E6). La línea de cron está en
 * `tasks/plan-despliegue.md` § D12.
 *
 * Sale con 0 si la vuelta terminó —aunque no hubiera nada que vencer— y con 1 si no pudo, por
 * ejemplo con la base caída. Cada vuelta deja una línea en el log.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const retiradas = await app.get(ListaDeEspera).vencerOfertas();

    console.log(
      `${new Date().toISOString()} Lista de espera: ${retiradas} ofertas vencidas.`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      `${new Date().toISOString()} Lista de espera: no corrió. ` +
        (error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  });
}
