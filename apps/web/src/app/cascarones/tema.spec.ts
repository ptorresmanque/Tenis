import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CLAVE_DEL_TEMA } from './tema';

/**
 * T365 (SPEC-seo.md A12). Las páginas prerenderizadas se pintan antes de que arranque Angular: el
 * script del <head> de index.html pone el modo guardado antes de pintar, para que quien eligió
 * oscuro no vea un destello claro (ni al revés). Se prueba el script de verdad, sacado del archivo.
 */
describe('El modo guardado, antes de pintar', () => {
  const index = readFileSync(join(process.cwd(), 'src/index.html'), 'utf8');
  const raiz = document.documentElement;
  // En memoria: con Node 26, el `localStorage` de las pruebas queda sin definir (no hay
  // --localstorage-file). El script lo recibe como el global que es en el navegador.
  let guardados: Record<string, string> = {};
  const almacen = {
    getItem: (clave: string) => guardados[clave] ?? null,
    setItem: (clave: string, valor: string) => (guardados[clave] = valor),
  };

  const correrElScript = (conAlmacen: object = almacen) => {
    const codigo = index.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    if (!codigo?.includes(CLAVE_DEL_TEMA)) throw new Error('index.html no trae el script del tema');
    new Function('localStorage', codigo)(conAlmacen);
  };

  afterEach(() => {
    guardados = {};
    raiz.removeAttribute('data-modo');
  });

  it.each(['oscuro', 'claro'])('**con «%s» guardado, lo pone en <html>**', (modo) => {
    almacen.setItem(CLAVE_DEL_TEMA, modo);

    correrElScript();

    expect(raiz.getAttribute('data-modo')).toBe(modo);
  });

  it('sin preferencia guardada no pone nada: manda el sistema', () => {
    correrElScript();

    expect(raiz.hasAttribute('data-modo')).toBe(false);
  });

  it('un valor que no es claro ni oscuro no se aplica', () => {
    almacen.setItem(CLAVE_DEL_TEMA, '"><b>');

    correrElScript();

    expect(raiz.hasAttribute('data-modo')).toBe(false);
  });

  it('con el almacenamiento bloqueado, la página carga igual', () => {
    const bloqueado = {
      getItem: () => {
        throw new Error('bloqueado');
      },
    };

    expect(() => correrElScript(bloqueado)).not.toThrow();
    expect(raiz.hasAttribute('data-modo')).toBe(false);
  });

  it('va en el <head>, antes de que se pinte nada', () => {
    expect(index.indexOf(CLAVE_DEL_TEMA)).toBeGreaterThan(-1);
    expect(index.indexOf(CLAVE_DEL_TEMA)).toBeLessThan(index.indexOf('</head>'));
  });
});
