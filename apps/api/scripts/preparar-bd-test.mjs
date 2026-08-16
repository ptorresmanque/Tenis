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

execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: urlTest },
});
