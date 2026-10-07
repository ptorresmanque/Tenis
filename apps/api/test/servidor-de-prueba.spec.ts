import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Todo spec que use supertest deja a la app escuchando en 127.0.0.1 antes de pedirle
 * algo: `await app.listen(0, '127.0.0.1')`, nunca `await app.init()` a secas.
 *
 * Con la app sin escuchar, supertest la levanta en cada petición con `listen(0)` —que
 * en Node escucha en `::`— y le habla a `127.0.0.1:<puerto>`. En macOS ese `listen`
 * funciona aunque otro programa ya tenga `127.0.0.1` en el mismo puerto (VS Code y el
 * agente de Battle.net, el 2026-10-06), y la conexión se la lleva el otro programa,
 * que contesta 401. Pasaba con uno de cada ~16 000 puertos por programa ajeno, y la
 * suite hace miles de peticiones: un test caído casi en cada corrida, en un spec
 * distinto cada vez. Un registro que nunca llegó a la API, un 401 en un endpoint sin
 * guard.
 *
 * Escuchando en 127.0.0.1 el sistema elige un puerto libre en esa misma dirección, y
 * supertest usa ese servidor en vez de levantar uno por petición.
 */
describe('El servidor de los tests', () => {
  const API = join(__dirname, '..');

  const specsConSupertest = ['test', 'src']
    .flatMap((carpeta) =>
      readdirSync(join(API, carpeta), {
        recursive: true,
        encoding: 'utf8',
      }).map((ruta) => join(carpeta, ruta)),
    )
    .filter((ruta) => ruta.endsWith('.spec.ts'))
    .filter((ruta) =>
      readFileSync(join(API, ruta), 'utf8').includes("from 'supertest'"),
    );

  it('encuentra specs que revisar', () => {
    expect(specsConSupertest.length).toBeGreaterThan(0);
  });

  it('escucha en 127.0.0.1, que es donde supertest se conecta', () => {
    const infractores = specsConSupertest.filter(
      (ruta) =>
        !readFileSync(join(API, ruta), 'utf8').includes(
          ".listen(0, '127.0.0.1')",
        ),
    );

    expect(infractores).toEqual([]);
  });
});
