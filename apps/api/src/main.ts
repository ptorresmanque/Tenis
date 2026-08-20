// Node carga el .env de forma nativa; no hace falta dotenv ni @nestjs/config.
process.loadEnvFile(`${__dirname}/../.env`);

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:4200',
    credentials: true,
  });

  configurarLaIpDelCliente(app);

  await app.listen(process.env.PORT ?? 3000);
}

/**
 * De quién es la IP que ve la aplicación cuando hay un proxy delante.
 *
 * **El freno a la fuerza bruta del login depende de esto.** Bloquea por correo e IP,
 * de modo que quien prueba contraseñas se cierra la puerta a sí mismo y el dueño de la
 * cuenta sigue entrando desde su casa. Detrás de nginx sin `trust proxy`, Express le
 * asigna a todo el mundo la IP del proxy: la llave se reduce al correo y cualquiera
 * puede dejar sin cuenta a un socio quince minutos con cinco intentos fallidos. La
 * defensa se convierte en el ataque.
 *
 * `PROXIES_DE_CONFIANZA` es cuántos saltos hay hasta el cliente —normalmente `1`, el
 * nginx del club—. Sin la variable no se confía en nadie, que es lo correcto cuando la
 * aplicación recibe conexiones directas: creerle a un `X-Forwarded-For` que cualquiera
 * puede escribir permitiría fingir una IP nueva en cada intento y saltarse el freno.
 */
function configurarLaIpDelCliente(app: NestExpressApplication): void {
  const saltos = Number(process.env.PROXIES_DE_CONFIANZA ?? 0);

  if (Number.isInteger(saltos) && saltos > 0) {
    app.set('trust proxy', saltos);
  }
}

void bootstrap();
