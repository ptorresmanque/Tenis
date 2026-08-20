// Aplica las migraciones a tenis_test antes de correr la suite.
// Se invoca desde el script "pretest" con `node --env-file=.env`.
import { execFileSync } from 'node:child_process';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('Falta DATABASE_URL. Copia apps/api/.env.example a apps/api/.env.');
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
    'Falta SHADOW_DATABASE_URL. Copia apps/api/.env.example a apps/api/.env.',
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

// Las transacciones sobrevivientes se borran antes de cada suite.
//
// `Transaccion` apunta a `Reserva` por `concepto` + `concepto_id` y no por una foreign
// key —el pago puede ser de una reserva o, mañana, de una cuota—, así que cuando un
// spec borra sus canchas las reservas caen en cascada y sus transacciones quedan.
// Se habían juntado 1.187.
//
// Eso es lo que producía el fallo intermitente que rondó desde T24: MariaDB recalcula
// el AUTO_INCREMENT como MAX(id)+1 al reiniciar el servidor, y la tabla `reserva`
// queda vacía al terminar la suite. Tras un reinicio, las reservas nuevas vuelven a
// numerarse desde 1 y caen sobre los `concepto_id` de las huérfanas: entonces el test
// que exige que la reserva del socio no tenga pago detrás encuentra uno, y falla sin
// que nada del código haya cambiado.
//
// Se hace por SQL con el CLI y no con el cliente de Prisma porque este script es un
// `.mjs` suelto y el cliente generado es TypeScript: cargarlo obligaría a compilar
// antes de poder preparar la base para compilar.
// La URL va por el entorno y no por `--url`: Prisma 7 la lee de `prisma.config.ts`,
// que a su vez toma `DATABASE_URL`. Es la misma forma en que se invoca `migrate deploy`
// unas líneas más arriba.
execFileSync('npx', ['prisma', 'db', 'execute', '--stdin'], {
  input: 'DELETE FROM transaccion;',
  stdio: ['pipe', 'inherit', 'inherit'],
  env: { ...process.env, DATABASE_URL: urlTest },
});
