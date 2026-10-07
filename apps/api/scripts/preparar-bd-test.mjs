// Toma tenis_test para esta corrida y le aplica las migraciones antes de la suite.
// Es el `globalSetup` de Jest (ver package.json); `soltar-bd-test.mjs` la devuelve.
// El .env lo carga Node con `--env-file` en el script "test".
import { execFileSync } from 'node:child_process';
import mariadb from 'mariadb';

/** Nombre del candado de MariaDB. Es de todo el servidor, no de una base. */
const CANDADO = 'tenis_test';

export default async function prepararBdTest() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Falta DATABASE_URL. Copia apps/api/.env.example a apps/api/.env.',
    );
  }

  const urlTest = url.replace(/\/tenis_dev(\?|$)/, '/tenis_test$1');
  if (!urlTest.includes('tenis_test')) {
    throw new Error(
      `No se pudo derivar la base de prueba desde ${url}. ` +
        'Abortando antes de migrar algo que no es tenis_test.',
    );
  }

  // **Una corrida a la vez.** Todos los checkouts —el repo y cada worktree— usan las
  // mismas tenis_test y tenis_shadow. Dos `npm test` solapados se pisan: la shadow se
  // resetea bajo los pies de la otra corrida y cae como si una migración estuviera
  // mal, y en tenis_test cada suite borra lo que la otra está usando. Medido el
  // 2026-10-06: 35 tests caídos en una y 6 en la otra.
  //
  // El candado lo tiene la conexión, así que dura lo que dura este proceso: si la
  // corrida muere, MariaDB lo suelta solo y no queda un candado huérfano que limpiar.
  const servidor = new URL(url);
  const conexion = await mariadb.createConnection({
    host: servidor.hostname,
    port: Number(servidor.port || 3306),
    user: decodeURIComponent(servidor.username),
    password: decodeURIComponent(servidor.password),
  });
  try {
    const [{ tomado, quienLoTiene }] = await conexion.query(
      'SELECT GET_LOCK(?, 0) AS tomado, IS_USED_LOCK(?) AS quienLoTiene',
      [CANDADO, CANDADO],
    );

    if (Number(tomado) !== 1) {
      throw new Error(
        'Hay otra corrida de los tests usando tenis_test ' +
          `(conexión ${quienLoTiene} de MariaDB). Espera a que termine: dos a la ` +
          'vez se borran los datos una a la otra.',
      );
    }

    migrar(urlTest);
  } catch (error) {
    // Sin esto la conexión abierta deja a Jest colgado después del error.
    await conexion.end();
    throw error;
  }

  // Lo lee `soltar-bd-test.mjs`: Jest comparte los globales del setup con el teardown.
  globalThis.candadoBdTest = conexion;
}

function migrar(urlTest) {
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
        'schema.prisma sin su migración. Si el error de Prisma habla de tablas que ' +
        'ya existen o que no están, puede ser otro proceso usando tenis_shadow a la ' +
        'vez, como un `prisma migrate dev`.',
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

  // Lo que producción siempre tiene: la fila de configuración del club y las categorías
  // de juego, que el agente siembra con este mismo arranque después de cada migración
  // (D3). Sin esto, un spec que las necesita pasa o falla según el orden en que corran
  // los demás: con la base recién creada del CI, fallaban cuatro (D6). Va en otro
  // proceso con ts-node por lo mismo de arriba, y solo transpilando, que tarda 0,3 s.
  execFileSync('node', ['-r', 'ts-node/register', 'src/arranque.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: urlTest,
      ADMIN_INICIAL: '',
      TS_NODE_TRANSPILE_ONLY: 'true',
    },
  });
}
