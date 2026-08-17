// Aplica las migraciones a tenis_test antes de correr la suite.
// Se invoca desde el script "pretest" con `node --env-file=.env`.
import { execFileSync } from 'node:child_process';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('Falta DATABASE_URL. Copiá apps/api/.env.example a apps/api/.env.');
}

const urlTest = url.replace(/\/tenis_dev(\?|$)/, '/tenis_test$1');
if (!urlTest.includes('tenis_test')) {
  throw new Error(
    `No se pudo derivar la base de prueba desde ${url}. ` +
      'Abortando antes de migrar algo que no es tenis_test.',
  );
}

// Antes de tocar tenis_test: reconstruir la historia entera sobre la base vacía de
// la shadow. Una migración con el nombre fuera de orden —Prisma las aplica en orden
// lexicográfico— corre igual sobre una base que ya tiene las tablas, y solo se cae
// el día que alguien clona el repo. Acá se cae en la primera corrida de tests.
if (!process.env.SHADOW_DATABASE_URL) {
  throw new Error(
    'Falta SHADOW_DATABASE_URL. Copiá apps/api/.env.example a apps/api/.env.',
  );
}

// `migrate diff --from-migrations` reconstruye la historia entera sobre la shadow y
// la compara con el schema. Falla en dos casos que de otro modo aparecen recién
// cuando alguien clona el repo: una migración que no aplica desde cero, y un
// schema.prisma con cambios que ninguna migración escribió.
try {
  execFileSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-migrations',
      'prisma/migrations',
      '--to-schema',
      'prisma/schema.prisma',
      '--exit-code',
    ],
    { stdio: 'inherit' },
  );
} catch {
  throw new Error(
    'Las migraciones no reconstruyen el schema sobre una base vacía. ' +
      'Suele ser una migración con el nombre fuera de orden —Prisma las aplica en ' +
      'orden alfabético, así que el timestamp va en UTC— o un cambio de ' +
      'schema.prisma sin su migración.',
  );
}

execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: urlTest },
});
