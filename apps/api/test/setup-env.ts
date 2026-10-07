// Los tests corren contra tenis_test, nunca contra la base de desarrollo.
// Se ejecuta antes de cada archivo de test (ver jest.setupFiles en package.json).
// El .env lo carga Node con --env-file antes de arrancar Jest (ver script "test").
// No se puede cargar acá dentro: process.loadEnvFile escribe en el process.env real,
// y Jest le da a cada archivo de test un process.env propio.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'Falta DATABASE_URL. Copia apps/api/.env.example a apps/api/.env.',
  );
}

process.env.DATABASE_URL = url.replace(/\/tenis_dev(\?|$)/, '/tenis_test$1');

if (!process.env.DATABASE_URL.includes('tenis_test')) {
  throw new Error(
    `Los tests apuntan a una base que no es tenis_test: ${process.env.DATABASE_URL}. ` +
      'Abortando antes de tocar datos que no son de prueba.',
  );
}

// Los tests nunca mandan correo de verdad, aunque el .env de quien los corre traiga
// CORREO_REMITENTE (D5): con él, cada registro de prueba saldría por el sendmail del
// equipo hacia correos inventados.
delete process.env.CORREO_REMITENTE;
