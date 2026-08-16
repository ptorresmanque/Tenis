import { defineConfig } from 'prisma/config';

// Node 22+ carga archivos .env de forma nativa. Prisma genera este archivo con
// `import "dotenv/config"`, pero esa dependencia no hace falta acá.
//
// Si DATABASE_URL ya viene del entorno, gana: así `preparar-bd-test` puede apuntar
// las migraciones a tenis_test sin tocar el .env.
if (!process.env['DATABASE_URL']) {
  process.loadEnvFile(new URL('.env', import.meta.url).pathname);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    // El usuario del proyecto solo tiene permisos sobre sus propias bases, así que
    // Prisma no puede crear la shadow al vuelo. Tiene que existir de antemano.
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});
