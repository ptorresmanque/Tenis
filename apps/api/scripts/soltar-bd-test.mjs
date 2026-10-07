// El `globalTeardown` de Jest: suelta tenis_test para la próxima corrida.
// Cerrar la conexión basta: el candado de `preparar-bd-test.mjs` vive en ella.
export default async function soltarBdTest() {
  await globalThis.candadoBdTest?.end();
}
