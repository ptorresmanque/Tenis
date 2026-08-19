import { defineConfig, devices } from '@playwright/test';

/**
 * El E2E del eje de la demo (T26).
 *
 * **`PAGOS_PASARELA=doble` no es opcional acá**: el criterio de la tarea es que esto
 * corra en CI sin depender del ambiente de integración de Transbank, que es lento y
 * está fuera de nuestro control. Para eso se construyó el puerto antes que el
 * adaptador (T16).
 *
 * `reuseExistingServer: false` a propósito: reutilizar un `npm run dev` que alguien
 * dejó abierto significaría correr contra Webpay de verdad, y el fallo saldría como un
 * timeout incomprensible en vez de "el puerto está ocupado".
 */
export default defineConfig({
  testDir: './e2e',
  // Uno a la vez: el eje toma una hora concreta de una cancha concreta, así que dos
  // corridas en paralelo competirían por el mismo bloque.
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4200',
    // Solo cuando algo falla: guardar siempre el rastro engorda cada corrida.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'PAGOS_PASARELA=doble npm run dev',
    url: 'http://localhost:4200',
    reuseExistingServer: false,
    // Levanta API, web y el compilador de Angular: el primer arranque no es rápido.
    timeout: 120_000,
    stdout: 'pipe',
  },
});
