// Como main.ts: el .env de la app, que en el servidor es un symlink al del ambiente. Antes
// de los imports, por si alguno lee una variable al cargarse.
process.loadEnvFile(`${__dirname}/../.env`);

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { RecordatoriosDeCuota, topePorCorrida } from './cuotas/recordatorios';
import { RecordatoriosDeRetiro } from './tienda/recordatorio-retiro';

type Tanda = { enviados: number; pendientes: number };

/**
 * Una corrida: los de cuota primero, que le impiden reservar a alguien, y después los de
 * retiro de la tienda (T171) **con lo que quede del mismo tope**. El hosting limita los
 * correos por hora; dos tandas con su propio tope lo pasarían entre las dos.
 */
export async function correrRecordatorios(
  cuotas: Pick<RecordatoriosDeCuota, 'correrTanda'>,
  retiros: Pick<RecordatoriosDeRetiro, 'correrTanda'>,
  ahora = new Date(),
  tope = topePorCorrida(),
): Promise<{ cuota: Tanda; retiro: Tanda }> {
  const cuota = await cuotas.correrTanda(ahora, tope);
  const retiro = await retiros.correrTanda(ahora, tope - cuota.enviados);

  return { cuota, retiro };
}

/**
 * Una tanda de recordatorios de cuota (T111) y de retiro (T171), para el cron de cPanel (T112):
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
    const { cuota, retiro } = await correrRecordatorios(
      app.get(RecordatoriosDeCuota),
      app.get(RecordatoriosDeRetiro),
    );

    console.log(
      `${new Date().toISOString()} Recordatorios de cuota: ${cuota.enviados} enviados, ` +
        `${cuota.pendientes} quedan para la próxima corrida. De retiro: ` +
        `${retiro.enviados} enviados, ${retiro.pendientes} quedan.`,
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
