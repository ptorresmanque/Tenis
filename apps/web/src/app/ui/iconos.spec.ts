import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * T369 (SPEC-seo.md, Fase 2). La fuente de íconos trae solo los que usa la web: la completa pesaba
 * 397 KB y frenaba el LCP. **Un ícono que falte se ve como su nombre en texto** («sports_tennis»),
 * así que esta prueba junta los que nombra el código y falla si alguno no está en la lista con que
 * se arma la fuente, `src/fuentes/iconos-en-uso.txt`. Al agregar uno: sumarlo a esa lista y correr
 * `node scripts/fuente-de-iconos.mjs`.
 */
const SRC = join(process.cwd(), 'src');
const leer = (archivo: string) => readFileSync(join(SRC, archivo), 'utf8');
const lista = (archivo: string) => new Set(leer(archivo).split('\n').filter(Boolean));

function archivos(carpeta: string): string[] {
  return readdirSync(join(SRC, carpeta), { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivos(ruta);
    return /\.(ts|css|scss)$/.test(entrada.name) && !entrada.name.endsWith('.spec.ts')
      ? [ruta]
      : [];
  });
}

const fuentes = [...archivos('app'), 'styles.css', 'tema-material.scss'].map((ruta) => ({
  ruta,
  texto: leer(ruta),
}));
const entreComillas = (texto: string) => [...texto.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);

/**
 * Dónde nombra un ícono el código: el texto de <mat-icon>, `icono`, las constantes `ICONO_*` e
 * `ICONOS_*` (como `ICONO_DE_INSIGNIA` o `ICONOS_DE_MOTIVO`, mapas a ícono) y el `content` del CSS.
 */
function iconosDe(texto: string): string[] {
  const enMatIcon = [...texto.matchAll(/<mat-icon[^>]*>([\s\S]*?)<\/mat-icon>/g)].flatMap(
    ([, contenido]) => (contenido.includes('{{') ? entreComillas(contenido) : [contenido.trim()]),
  );
  // `icono: 'x'`, `icono="x"` y `[icono]="cond ? 'a' : 'b'"`: hasta la coma, el punto y coma o la llave.
  const enIcono = [
    ...texto.matchAll(/icono\]?\s*(?:=\s*"([a-z0-9_]+)"|[:=]\s*([^,;}]*))/g),
  ].flatMap(([, atributo, expresion]) => (atributo ? [atributo] : entreComillas(expresion ?? '')));
  const enConstantes = [...texto.matchAll(/ICONOS?_[A-Z_]*[^=\n]*=\s*\{([^}]*)\}/g)].flatMap(
    ([, cuerpo]) => entreComillas(cuerpo),
  );
  const enCss = [...texto.matchAll(/content:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
  return [...enMatIcon, ...enIcono, ...enConstantes, ...enCss];
}

/**
 * Los que Angular Material dibuja por su cuenta con la fuente: el encabezado del stepper (la
 * inscripción a un torneo) pone `create`, `done` o `warning` según el estado del paso.
 */
const DE_MATERIAL = ['create', 'done', 'warning'];

describe('La fuente de íconos (T369)', () => {
  const todos = lista('fuentes/nombres-material-symbols.txt');
  const enUso = lista('fuentes/iconos-en-uso.txt');
  const nombrados = new Map<string, string>(
    DE_MATERIAL.map((icono) => [icono, 'Angular Material']),
  );
  for (const { ruta, texto } of fuentes) {
    for (const icono of iconosDe(texto)) {
      if (todos.has(icono) && !nombrados.has(icono)) nombrados.set(icono, ruta);
    }
  }

  it('encuentra los íconos del código (la prueba no está ciega)', () => {
    expect(nombrados.size).toBeGreaterThan(40);
    expect(nombrados.has('sports_tennis')).toBe(true);
    expect(nombrados.has('military_tech')).toBe(true);
    expect(nombrados.has('progress_activity')).toBe(true);
    // De ICONO_DE_INSIGNIA, que solo se lee en el orden de juego.
    expect(nombrados.has('history')).toBe(true);
    // De ICONOS_DE_MOTIVO, que llega a la grilla como `bloqueo.icono`.
    expect(nombrados.has('build')).toBe(true);
  });

  it('**todo ícono que nombra el código está en la fuente**', () => {
    const faltan = [...nombrados]
      .filter(([icono]) => !enUso.has(icono))
      .map(([i, r]) => `${i} (${r})`);
    expect(faltan).toEqual([]);
  });

  // El recorte pide fontTools y no corre en el CI: sumar un ícono a la lista sin correr el script
  // dejaría la fuente sin él. El script deja junto a la fuente la lista con que la armó.
  it('**la fuente versionada se armó con esta lista**', () => {
    expect(
      lista('fuentes/iconos-en-la-fuente.txt'),
      'corre `node scripts/fuente-de-iconos.mjs`',
    ).toEqual(enUso);
  });

  it('la lista solo trae nombres de Material Symbols', () => {
    expect([...enUso].filter((icono) => !todos.has(icono))).toEqual([]);
  });

  // Un <mat-icon> con un valor que no es un `icono` ni un texto fijo quedaría fuera de la lista
  // sin que nadie lo note.
  it('cada <mat-icon> dinámico lee un `icono`, una constante `ICONO(S)_*` o elige entre textos fijos', () => {
    const sueltos = fuentes.flatMap(({ ruta, texto }) =>
      [...texto.matchAll(/<mat-icon[^>]*>\s*\{\{([\s\S]*?)\}\}\s*<\/mat-icon>/g)]
        .map(([, expresion]) => expresion.trim())
        .filter(
          (expresion) =>
            !/icono(\(\))?$/.test(expresion) &&
            !/^ICONOS?_[A-Z_]*\[/.test(expresion) &&
            entreComillas(expresion).length === 0,
        )
        .map((expresion) => `${ruta}: {{ ${expresion} }}`),
    );
    expect(sueltos).toEqual([]);
  });
});
