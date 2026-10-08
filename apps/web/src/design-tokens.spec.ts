import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { VARIANTES_AVISO } from './app/ui/aviso';
import { VARIANTES_INSIGNIA } from './app/ui/insignia';
import { VOSEO } from './voseo';

/**
 * Lint del sistema de diseño.
 *
 * **La fuente de verdad es este código.** Lo fue el proyecto de Stitch hasta el
 * 2026-09-08, cuando el club decidió lo contrario; el histórico de esa etapa
 * está en `tasks/plan-diseno-fedal.md`. Esta suite es lo que impide que el
 * sistema se desarme sin que nadie se entere.
 *
 * Mide el contraste real de los tokens leyendo styles.css, no una copia, y lo
 * mide **en los dos temas**: el claro que vive en `@theme` y el oscuro que vive
 * en la regla de `prefers-color-scheme`. Un tema que nadie midió es un tema que
 * se publica roto.
 */

// El runner de tests de Angular corre desde apps/web. No se usa import.meta.url:
// dentro del bundle de test no resuelve a una ruta de archivo.
const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

/**
 * El cuerpo del bloque CSS que empieza con `apertura`, con las llaves contadas.
 *
 * Hace falta contarlas porque el bloque del tema oscuro vive dentro de un
 * `@media`, y cortar en la primera llave de cierre dejaría fuera la mitad de
 * los tokens sin que ningún test se quejara.
 */
function bloque(apertura: string): string {
  const inicio = css.indexOf(apertura);
  if (inicio === -1) {
    throw new Error(`styles.css no tiene el bloque "${apertura}"`);
  }

  let profundidad = 0;
  for (let i = inicio + apertura.length - 1; i < css.length; i++) {
    if (css[i] === '{') profundidad++;
    if (css[i] === '}' && --profundidad === 0) {
      return css.slice(inicio, i);
    }
  }
  throw new Error(`El bloque "${apertura}" no cierra`);
}

function tokensDeColor(fuente: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, nombre, valor] of fuente.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)) {
    tokens.set(nombre, valor);
  }
  return tokens;
}

const CLARO = tokensDeColor(bloque('@theme {'));
// El oscuro redefine lo que cambia y hereda el resto, igual que la cascada.
const OSCURO = new Map([
  ...CLARO,
  ...tokensDeColor(bloque("html[data-tema='publico']:not([data-modo='claro']) {")),
]);

/** Los dos temas que hay que medir. El claro manda donde no hay tema oscuro. */
const TEMAS: readonly [string, Map<string, string>][] = [
  ['claro', CLARO],
  ['oscuro', OSCURO],
];

function colorDe(tema: Map<string, string>, nombre: string): string {
  const valor = tema.get(nombre);
  if (!valor) {
    throw new Error(`El token --color-${nombre} no existe en styles.css`);
  }
  return valor;
}

/** Atajo para los tests que solo hablan del tema claro. */
function color(nombre: string): string {
  return colorDe(CLARO, nombre);
}

/** Luminancia relativa según WCAG 2.1. */
function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
}

function contraste(unColor: string, otro: string): number {
  const [claro, oscuro] = [luminancia(unColor), luminancia(otro)].sort((a, b) => b - a);
  return (claro + 0.05) / (oscuro + 0.05);
}

// Cada par es una combinación que la interfaz usa de verdad, en los dos temas.
const PARES_DE_TEXTO: readonly [string, string, string][] = [
  ['texto principal sobre el fondo', 'foreground', 'background'],
  ['texto principal sobre tarjeta', 'foreground', 'card'],
  ['texto secundario sobre el fondo', 'muted-foreground', 'background'],
  ['texto secundario sobre tarjeta', 'muted-foreground', 'card'],
  ['etiqueta sobre botón primario', 'on-primary', 'primary'],
  ['etiqueta sobre botón secundario', 'on-primary', 'secondary'],
  ['etiqueta sobre verde fuerte', 'on-accent', 'accent-strong'],
  ['texto primario sobre tarjeta', 'primary', 'card'],
  ['texto verde fuerte sobre tarjeta', 'accent-strong', 'card'],
  ['texto verde fuerte sobre el fondo', 'accent-strong', 'background'],
];

/**
 * Los dos temas, medidos con la misma vara.
 *
 * El tema claro además tiene abajo sus propios tests, más finos, porque su
 * paleta lleva más historia: los tres verdes, los tres ámbares y los grises de
 * la grilla tienen cada uno su razón documentada.
 */
it('en oscuro, la celda libre del marcador no es una zona clara (TV6.1)', () => {
  // El defecto que obligó a crear el campo en D6.2: en un tema oscuro, lo que
  // ocupa área no puede ser lo más claro de la pantalla. El marcador pinta hasta
  // cuarenta celdas libres; con el relleno en #34d399 eran 61.000px² a 0,50 de
  // luminancia a las 17:30, más que todos los botones y rótulos juntos.
  expect(luminancia(colorDe(OSCURO, 'celda-libre'))).toBeLessThan(0.1);
});

it('los dos bloques del tema oscuro son idénticos', () => {
  // El tema oscuro se declara dos veces: una para cuando lo pide el sistema y
  // otra para cuando lo pide el visitante con el conmutador. No hay forma de
  // evitar la duplicación —una lista de selectores no puede mezclar uno normal
  // con otro que vive dentro de un `@media`—, así que lo que hay es este test:
  // tocar un bloque y no el otro deja al conmutador pintando un tema distinto
  // del que pinta el sistema, y nadie lo notaría hasta usarlo.
  const porElSistema = bloque("html[data-tema='publico']:not([data-modo='claro']) {");
  const aMano = bloque("html[data-tema='publico'][data-modo='oscuro'] {");

  const soloLosTokens = (b: string) => b.slice(b.indexOf('{') + 1).trim();

  expect(soloLosTokens(aMano)).toBe(soloLosTokens(porElSistema));
});

describe.each(TEMAS)('Contraste del tema %s', (_, tema) => {
  const c = (nombre: string) => colorDe(tema, nombre);

  it.each(PARES_DE_TEXTO)('%s cumple AA para texto normal (4.5:1)', (_titulo, frente, fondo) => {
    expect(contraste(c(frente), c(fondo))).toBeGreaterThanOrEqual(4.5);
  });

  it('el anillo de foco se distingue del fondo y de la tarjeta (3:1)', () => {
    expect(contraste(c('ring'), c('background'))).toBeGreaterThanOrEqual(3);
    expect(contraste(c('ring'), c('card'))).toBeGreaterThanOrEqual(3);
  });

  it('el texto del bloque libre se lee sobre su propio fondo (4.5:1)', () => {
    expect(contraste(c('accent-strong'), c('accent-soft'))).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto del panel ámbar se lee sobre su propio fondo (4.5:1)', () => {
    expect(contraste(c('warning-strong'), c('warning-soft'))).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto de error se lee sobre el fondo y sobre la tarjeta (4.5:1)', () => {
    expect(contraste(c('destructive-strong'), c('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c('destructive-strong'), c('card'))).toBeGreaterThanOrEqual(4.5);
  });

  it('la etiqueta del botón destructivo se lee encima (4.5:1)', () => {
    // En claro el botón es rojo y la etiqueta blanca; en oscuro el botón es
    // rosado y la etiqueta oscura. El token `on-primary` sirve a los dos.
    expect(contraste(c('on-primary'), c('destructive'))).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto de una banda plena se lee encima', () => {
    // El campo es fondo de región y no color de botón: `primary` en oscuro se
    // aclara para seguir leyéndose como algo pulsable, y una banda pintada con
    // ese azul claro convertía al hero en la zona más brillante de una pantalla
    // oscura. Son dos tokens desde el 2026-09-08 y este par es la razón.
    expect(contraste(c('on-campo'), c('campo'))).toBeGreaterThanOrEqual(4.5);
  });

  it('la banda plena se distingue del fondo de la página', () => {
    // Si el campo y el fondo tuvieran la misma luminancia, la banda dejaría de
    // ser una banda. No es un mínimo de WCAG: es que la composición exista.
    expect(contraste(c('campo'), c('background'))).toBeGreaterThanOrEqual(1.3);
  });

  it('el texto de un rótulo se lee encima (4.5:1)', () => {
    // El rótulo es la placa de la transmisión: la cinta, el rótulo del zócalo,
    // el lado visitante del cara a cara (plan de transmisión, TV1.4).
    expect(contraste(c('on-rotulo'), c('rotulo'))).toBeGreaterThanOrEqual(4.5);
  });

  it('el rótulo se distingue del fondo y de la banda plena', () => {
    // Va pegado al campo —la cinta bajo el hero, el visitante junto al socio—,
    // así que tiene que separarse de los dos. En oscuro esto descarta un rótulo
    // más oscuro que la página: ni el negro puro llega a 1,3:1 contra #0a1b33,
    // y por eso ahí el rótulo es una placa clara.
    expect(contraste(c('rotulo'), c('background'))).toBeGreaterThanOrEqual(1.3);
    expect(contraste(c('rotulo'), c('campo'))).toBeGreaterThanOrEqual(1.3);
  });

  it('la celda libre del marcador se distingue del campo y su texto se lee', () => {
    // El marcador de la portada pinta las canchas libres sobre el campo. La celda
    // es un control, así que pide el 3:1 de componente contra lo que la rodea.
    // Desde TV6.1 lo carga el borde y no el relleno: en oscuro, un relleno que
    // llegue a 3:1 contra el campo es claro, y cuarenta celdas claras eran la
    // zona más brillante de la portada.
    expect(contraste(c('borde-celda-libre'), c('campo'))).toBeGreaterThanOrEqual(3);
    expect(contraste(c('on-celda-libre'), c('celda-libre'))).toBeGreaterThanOrEqual(4.5);
  });

  it('las dos capas del logotipo se leen sobre el campo', () => {
    // El pie va en banda de campo (TV2.4). En claro, la capa "marca" del logotipo
    // es el mismo azul del campo y desaparecería: sobre el campo usa su color
    // para fondo oscuro, y la capa "texto" usa el texto de la banda.
    expect(contraste(c('logo-marca-sobre-campo'), c('campo'))).toBeGreaterThanOrEqual(3);
    expect(contraste(c('on-campo'), c('campo'))).toBeGreaterThanOrEqual(4.5);
  });

  it('las dos capas del logotipo se leen sobre el fondo', () => {
    // La marca es forma y le basta el 3:1 de componente; el texto es texto.
    expect(contraste(c('logo-marca'), c('background'))).toBeGreaterThanOrEqual(3);
    expect(contraste(c('logo-texto'), c('background'))).toBeGreaterThanOrEqual(4.5);
  });

  it('la etiqueta del bloque ocupado y la del elegido se leen', () => {
    expect(contraste(c('foreground'), c('busy'))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c('foreground'), c('selected'))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c('muted-foreground'), c('busy'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Contraste de los tokens de color', () => {

  it('el blanco sobre destructive cumple AA: los errores hay que poder leerlos', () => {
    expect(contraste('#ffffff', color('destructive'))).toBeGreaterThanOrEqual(4.5);
  });

  it('el anillo de foco se distingue del fondo (3:1 para componentes)', () => {
    expect(contraste(color('ring'), color('background'))).toBeGreaterThanOrEqual(3);
  });

  describe('los tres verdes', () => {
    // Esta es la razón de que existan tres tokens de verde en vez de uno.
    it('accent sirve como color de componente (3:1) pero NO para texto normal', () => {
      const razon = contraste(color('accent'), color('card'));

      expect(razon).toBeGreaterThanOrEqual(3);
      expect(razon).toBeLessThan(4.5);
    });

    it('accent-strong sí puede llevar texto encima (4.5:1)', () => {
      expect(
        contraste(color('on-accent'), color('accent-strong')),
      ).toBeGreaterThanOrEqual(4.5);
    });

    // El par del bloque libre de la grilla, que es donde vive la decisión de
    // reservar. Stitch propuso #a7f3d0 para el hover: da 4.28:1 y por eso no
    // existe como token. Si alguien lo agrega, este test no lo ve —lo ve el
    // de "ningún token de fondo verde queda por debajo de AA".
    it('el texto del bloque libre se lee sobre su propio fondo (4.5:1)', () => {
      expect(
        contraste(color('accent-strong'), color('accent-soft')),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('los tres ámbares', () => {
    // El ámbar del diseño (#d97706) repite el problema del verde: sirve de
    // componente y no de texto. Sin estos tres tokens, "esperando el pago" y
    // "por vencer" no se pueden escribir sin hardcodear un color.
    it('warning sirve como color de componente (3:1) pero NO para texto normal', () => {
      const razon = contraste(color('warning'), color('card'));

      expect(razon).toBeGreaterThanOrEqual(3);
      expect(razon).toBeLessThan(4.5);
    });

    it('warning-strong sí sirve como texto, sobre tarjeta y sobre el fondo', () => {
      expect(contraste(color('warning-strong'), color('card'))).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contraste(color('warning-strong'), color('background')),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('el texto del panel de aviso se lee sobre su propio fondo (4.5:1)', () => {
      expect(
        contraste(color('warning-strong'), color('warning-soft')),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('las variantes de insignia y de aviso', () => {
    // Los tests de arriba miden tokens sueltos; estos miden lo que la variante
    // arma de verdad: un fondo al 10% sobre la tarjeta con su texto encima.
    // Sin esto, cambiar `bg-accent-strong/10` por `bg-accent` en la tabla de
    // variantes no lo caza nadie —el token accent existe y pasa su propio
    // test— y la insignia queda en 3.7:1 en las cinco pantallas que la usan.

    /** El color de una clase de Tailwind, con su alfa si la trae. */
    function deClase(clases: string, prefijo: 'bg' | 'text'): [string, number] {
      const uso = clases.match(new RegExp(`\\b${prefijo}-([a-z-]+?)(?:/(\\d+))?(?=\\s|$)`));

      if (!uso) throw new Error(`La variante no declara ${prefijo}-: ${clases}`);

      return [color(uso[1]), uso[2] ? Number(uso[2]) / 100 : 1];
    }

    /** Lo que ve el ojo cuando un color translúcido cae sobre otro opaco. */
    function sobre(fondo: string, [frente, alfa]: [string, number]): string {
      const canal = (i: number) =>
        Math.round(
          parseInt(frente.slice(i, i + 2), 16) * alfa +
            parseInt(fondo.slice(i, i + 2), 16) * (1 - alfa),
        );

      return `#${[1, 3, 5].map((i) => canal(i).toString(16).padStart(2, '0')).join('')}`;
    }

    const variantes = [
      ...Object.entries(VARIANTES_INSIGNIA).map(
        ([nombre, v]) => [`insignia ${nombre}`, v.clases] as const,
      ),
      ...Object.entries(VARIANTES_AVISO).map(
        ([nombre, v]) => [`aviso ${nombre}`, v.clases] as const,
      ),
    ];

    it.each(variantes)('%s se lee sobre su propio fondo (4.5:1)', (_, clases) => {
      const fondo = sobre(color('card'), deClase(clases, 'bg'));
      const [texto] = deClase(clases, 'text');

      expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5);
    });

    it('cada variante trae su ícono: el color no puede ser la única señal', () => {
      // El anti-patrón del master. Una insignia que solo cambia de color no
      // dice nada a quien no distingue el verde del rojo.
      const sinIcono = [
        ...Object.entries(VARIANTES_INSIGNIA),
        ...Object.entries(VARIANTES_AVISO),
      ]
        .filter(([, variante]) => !variante.icono)
        .map(([nombre]) => nombre);

      expect(sinIcono).toEqual([]);
    });
  });

  describe('los grises de estado de la grilla', () => {
    // Un bloque ocupado y uno en mantención se ven distintos, pero los dos
    // tienen que dejar leer su etiqueta: sin esto el estado se comunica solo
    // por color, que es justo el anti-patrón del master.
    it.each([
      ['ocupado', 'busy'],
      ['en mantención', 'muted'],
      ['elegido', 'selected'],
    ])('la etiqueta del bloque %s se lee (4.5:1)', (_, fondo) => {
      expect(contraste(color('muted-foreground'), color(fondo))).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  });
});

const RAIZ = join(process.cwd(), 'src/app');

/**
 * Toda plantilla del proyecto: los `.ts` con template inline y los `.html`.
 *
 * Se leen los dos porque si sólo mirara los `.ts`, el primer componente con
 * `templateUrl` quedaría sin revisar y el test pasaría igual. Un guardia que
 * deja de guardar sin avisar es peor que ninguno.
 */
function plantillas(): { archivo: string; contenido: string }[] {
  return readdirSync(RAIZ, { recursive: true, encoding: 'utf8' })
    .filter(
      (ruta) =>
        (ruta.endsWith('.ts') && !ruta.endsWith('.spec.ts')) || ruta.endsWith('.html'),
    )
    .map((ruta) => ({
      archivo: ruta,
      contenido: readFileSync(join(RAIZ, ruta), 'utf8'),
    }));
}

describe('Tipografía', () => {
  // El fallo que atrapa: alguien cambia --font-display y la app se sirve con
  // la fuente de respaldo del sistema. Nada falla, nadie se entera, y el
  // diseño se ve distinto en producción que en Stitch.
  const html = readFileSync(join(process.cwd(), 'src/index.html'), 'utf8');
  const fuentes = readFileSync(join(process.cwd(), 'src/fuentes.css'), 'utf8');

  /** Cada @font-face de fuentes.css: su familia, su font-display y sus archivos. */
  const caras = [...fuentes.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, cuerpo]) => ({
    familia: cuerpo.match(/font-family:\s*'([^']+)'/)?.[1],
    display: cuerpo.match(/font-display:\s*([\w-]+)/)?.[1],
    archivos: [...cuerpo.matchAll(/url\('?([^')]+)'?\)/g)].map(([, ruta]) => ruta),
  }));

  function familias(): string[] {
    const declaradas = new Set<string>();

    // Anclado al inicio de línea: sin eso, `--text-marcador--font-weight: 800`
    // entra por la subcadena `--font-` y el test pide cargar "la fuente 800".
    for (const [, valor] of css.matchAll(/^\s*--font-[\w-]+:\s*([^;]+);/gm)) {
      // Solo la primera de la lista: las que siguen son el respaldo, y
      // ui-sans-serif o system-ui no se cargan de ningún lado.
      const primera = valor.split(',')[0].trim().replace(/['"]/g, '');
      if (primera.startsWith('ui-') || primera === 'system-ui') continue;
      declaradas.add(primera);
    }

    return [...declaradas];
  }

  it('declara al menos una familia', () => {
    expect(familias().length).toBeGreaterThan(0);
  });

  it.each(familias())('fuentes.css carga la fuente %s', (familia) => {
    // Se compara el nombre entero: `Barlow` también aparece dentro de
    // `Barlow Condensed`, y una familia que solo carga a su hermana condensada
    // no puede pasar el test sin cargarse.
    expect(caras.map((cara) => cara.familia)).toContain(familia);
  });

  it('las fuentes salen del propio sitio y no de Google', () => {
    // Cada fuente pedida a fonts.googleapis.com le pasaba a Google la IP de quien
    // entraba, en cualquier página y sin que eligiera nada (ver la política de
    // privacidad).
    expect(html + fuentes).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it('cada archivo que nombra fuentes.css existe', () => {
    // El build de Angular resuelve los url() relativos, y uno que no existe deja
    // a la familia con la fuente de respaldo sin que nadie lo vea en desarrollo.
    const archivos = caras.flatMap((cara) => cara.archivos);

    expect(archivos.length).toBeGreaterThan(0);
    for (const archivo of archivos) {
      expect(existsSync(join(process.cwd(), 'src', archivo)), archivo).toBe(true);
    }
  });

  it('la fuente de íconos se carga y no con display=swap', () => {
    // Material Symbols dibuja con ligaduras: con swap el usuario ve escrito
    // "check_circle" hasta que la fuente carga.
    const iconos = caras.find((cara) => cara.familia?.startsWith('Material Symbols'));

    expect(iconos).toBeDefined();
    expect(iconos?.display).toBe('block');
  });

  it('la familia de .icono es la que carga fuentes.css', () => {
    // Si el @font-face y la regla nombran familias distintas, cada ícono se pinta
    // como su nombre escrito: "calendar_month" en vez del calendario. Cargar una
    // fuente que nadie usa no lo detecta el test de arriba.
    const usada = css.match(/\.icono\s*\{[^}]*?font-family:\s*'([^']+)'/)?.[1];

    expect(usada).toBeDefined();
    expect(caras.map((cara) => cara.familia)).toContain(usada);
  });

  it('los íconos usan clase propia y no la de Google', () => {
    // La clase de Google (`.material-symbols-outlined`, `-rounded` o `-sharp`,
    // según la variante) viene sin capa y le gana a toda utilidad de Tailwind:
    // con esa clase, text-* sobre un ícono no hace nada. La clase propia .icono
    // está en @layer base y sí se deja mandar.
    expect(css).toContain('.icono');

    const infractores = plantillas()
      .filter(({ contenido }) => /material-symbols-(outlined|rounded|sharp)/.test(contenido))
      .map(({ archivo }) => archivo);

    expect(infractores).toEqual([]);
  });

  it('todo ícono está oculto al lector de pantalla', () => {
    // El nombre del ícono es texto de verdad dentro del elemento: sin
    // aria-hidden, el lector lee "check circle" antes del titular.
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      for (const [etiqueta] of contenido.matchAll(/<[a-z]+[^>]*\bclass="[^"]*\bicono\b[^"]*"[^>]*>/gs)) {
        if (/aria-hidden="true"|aria-label=/.test(etiqueta)) continue;

        infractores.push(`${archivo}: ${etiqueta.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }

    expect(infractores).toEqual([]);
  });
});

describe('Uso de los tokens en las plantillas', () => {
  // Los tests de arriba miden los colores; este mira cómo se combinan de verdad.
  // Sin él, `bg-accent` con texto blanco pasa desapercibido: fue exactamente el
  // error que se coló al escribir el chip de estado en T3.

  it('encuentra plantillas que revisar', () => {
    // Si un refactor mueve los componentes de carpeta, el escáner se quedaría sin
    // archivos y todos los tests de abajo pasarían por vacuidad.
    expect(plantillas().length).toBeGreaterThan(0);
  });

  it('ningún elemento combina bg-accent con texto blanco', () => {
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      for (const [, clases] of contenido.matchAll(/class="([^"]*)"/g)) {
        const usaAccentSuave = /\bbg-accent\b(?!-)/.test(clases);
        const textoBlanco = /\btext-(on-accent|white)\b/.test(clases);

        if (usaAccentSuave && textoBlanco) {
          infractores.push(`${archivo}: ${clases.replace(/\s+/g, ' ').trim()}`);
        }
      }
    }

    // bg-accent sobre blanco da 3.77:1. Para texto usá bg-accent-strong.
    expect(infractores).toEqual([]);
  });

  it('ninguna plantilla escribe un color a mano', () => {
    // Un hex suelto es un color que ningún test mide y que nadie va a
    // actualizar cuando cambie la paleta. La referencia de Stitch entra al
    // código por @theme o no entra.
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      for (const linea of contenido.split('\n')) {
        const hex = linea.match(/#[0-9a-f]{3,8}\b/i);
        const color = linea.match(/\b(rgba?|hsla?|oklch)\(/i);

        if (hex ?? color) {
          infractores.push(`${archivo}: ${linea.trim().slice(0, 90)}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it('ninguna clase de Tailwind usa un valor arbitrario de color o tipografía', () => {
    // bg-[#0b4f9e] o font-['Inter'] esquivan @theme igual que un hex suelto,
    // y además esquivan al test de arriba.
    const infractores: string[] = [];
    const ARBITRARIO = /\b(bg|text|border|ring|fill|stroke|from|via|to|font|shadow)-\[[^\]]+\]/g;

    for (const { archivo, contenido } of plantillas()) {
      for (const [, clases] of contenido.matchAll(/class="([^"]*)"/g)) {
        for (const [uso] of clases.matchAll(ARBITRARIO)) {
          infractores.push(`${archivo}: ${uso}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it('no queda rastro de la paleta anterior', () => {
    // El club pasó de arcilla a cancha dura. Un terracota olvidado en una
    // plantilla no lo caza ninguno de los tests de contraste, porque los
    // tokens viejos ya no existen en styles.css.
    const VIEJOS = /#(9a3412|c2410c|fffbeb|f2e6e2|f8f2f0)\b/i;
    const infractores = plantillas()
      .filter(({ contenido }) => VIEJOS.test(contenido))
      .map(({ archivo }) => archivo);

    expect(infractores).toEqual([]);
  });

  it('ningún ícono es un emoji', () => {
    // El diseño de Stitch usa Material Symbols en sus 83 íconos. Un emoji se
    // ve distinto en cada sistema operativo y los lectores de pantalla lo
    // leen en voz alta con su nombre completo.
    // En alternativas y no en una sola clase: el selector de variación ️
    // combina con el carácter anterior, y meterlo en la clase junto a los
    // rangos hace que la regla se lea al revés de lo que hace.
    const EMOJI =
      /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|\u{FE0F}/u;
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      contenido.split('\n').forEach((linea, i) => {
        if (EMOJI.test(linea)) {
          infractores.push(`${archivo}:${i + 1}: ${linea.trim().slice(0, 70)}`);
        }
      });
    }

    expect(infractores).toEqual([]);
  });

  it('todo botón declara su cursor', () => {
    // Del checklist del master: cursor-pointer en todo lo que se puede pulsar.
    //
    // Solo <button>. El Preflight de Tailwind v4 dejó de forzar
    // `cursor: pointer` en botones —v3 lo hacía— así que un <button> sin la
    // clase sale con la flecha del sistema y no se lee como pulsable. Los <a>
    // no entran: con href o routerLink el navegador ya pone la manito.
    //
    // La clase `.boton` de styles.css también cuenta: lo trae puesto. Que lo
    // siga trayendo lo comprueba el test de abajo, que es la mitad que hace
    // que esta excepción no sea un agujero.
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      for (const [etiqueta] of contenido.matchAll(/<button\b[^>]*>/gs)) {
        if (/\bcursor-/.test(etiqueta)) continue;
        if (/\bboton\b/.test(etiqueta)) continue;

        infractores.push(`${archivo}: ${etiqueta.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }

    expect(infractores).toEqual([]);
  });

  it('la clase .boton trae el cursor puesto', () => {
    // Si alguien la saca, el test de arriba seguiría dejando pasar todos los
    // <button class="boton">, y quedarían con la flecha del sistema sin que
    // nada avise. Este es el caso que hace fallar a esa excepción.
    const boton = css.match(/\.boton\s*\{[^}]*\}/)?.[0];

    expect(boton).toBeDefined();
    expect(boton).toMatch(/cursor:\s*pointer/);
  });
});

/**
 * El archivo sin sus comentarios.
 *
 * Los tests de estilo miran lo que el usuario lee y lo que el navegador
 * ejecuta, no lo que el código explica de sí mismo. Sin esto, el comentario
 * que dice "no escribas 250ms a mano" hace fallar al test que prohíbe escribir
 * 250ms a mano, que es la forma más tonta de perder una tarde.
 */
function sinComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
}

describe('Español de Chile', () => {
  /**
   * El voseo rioplatense no entra al sitio.
   *
   * La regla vive en CLAUDE.md y llegó por una razón concreta: el 2026-09-08 se
   * encontraron dos frases voseantes **a la vista del socio** —"Elegí una cancha
   * … al toque" en el estado vacío de Mis reservas, y "Reservá en línea" en el
   * pie de las quince pantallas públicas—. Una regla de estilo que depende de
   * que alguien se acuerde no es una regla.
   *
   * Solo mira plantillas, que es donde vive el texto que alguien lee. En prosa
   * técnica "elegí" puede ser el pretérito legítimo de la primera persona.
   */
  it('ninguna plantilla usa voseo rioplatense', () => {
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      for (const [forma] of sinComentarios(contenido).matchAll(VOSEO)) {
        infractores.push(`${archivo}: "${forma}"`);
      }
    }

    expect(infractores).toEqual([]);
  });

  it('el club se llama FEDAL Tennis Center y no de otra forma', () => {
    // Dos nombres conviviendo fue deuda declarada del diseño anterior. El
    // descriptor "Club de Tenis" quedó fuera cuando el club confirmó el suyo.
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      if (/Club de Tenis/.test(sinComentarios(contenido))) {
        infractores.push(archivo);
      }
    }

    expect(infractores).toEqual([]);
  });
});

describe('Movimiento', () => {
  /**
   * Las curvas y las duraciones salen de los tokens, nunca de la mano.
   *
   * El fallo que atrapa: alguien escribe `transition: transform 300ms ease` en
   * un componente, y el sitio termina con cinco velocidades distintas para el
   * mismo gesto sin que nadie lo haya decidido. Los tokens están en styles.css
   * con la razón de cada valor.
   */
  it('ningún componente escribe una curva a mano', () => {
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      const codigo = sinComentarios(contenido);
      for (const [uso] of codigo.matchAll(/cubic-bezier\([^)]*\)|\blinear\([^)]*\)/g)) {
        infractores.push(`${archivo}: ${uso}`);
      }
    }

    expect(infractores).toEqual([]);
  });

  it('ningún componente escribe una duración a mano', () => {
    // `0ms` y `0.01ms` sí: son "no animes", no una velocidad elegida. Y en
    // segundos también cuenta: hasta TV3.2 solo miraba milisegundos, y el
    // `1.4s` del esqueleto pasaba sin que nadie lo hubiera decidido.
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      const duraciones = /(?<![\w.-])(?!0ms|0\.01ms|0s)\d+(?:\.\d+)?m?s\b/g;
      for (const [uso] of sinComentarios(contenido).matchAll(duraciones)) {
        infractores.push(`${archivo}: ${uso}`);
      }
    }

    expect(infractores).toEqual([]);
  });

  it('define las curvas y las duraciones que el sistema usa', () => {
    for (const token of ['--ease-salida', '--ease-vaiven', '--ease-cajon', '--ease-rebote']) {
      expect(css).toContain(token);
    }
    for (const token of ['--duracion-pulsacion', '--duracion-menu', '--duracion-dialogo']) {
      expect(css).toContain(token);
    }
  });

  it('no existe una curva de entrada: ease-in hace que la interfaz se sienta lenta', () => {
    // Arranca despacio justo cuando el usuario está mirando. Para entrar se usa
    // --ease-salida. Que el token no exista es la forma de que nadie lo use.
    // Se busca la declaración y no la palabra: el comentario que explica esto
    // en styles.css la nombra, y nombrarla no es declararla.
    expect(css).not.toMatch(/^\s*--ease-entrada\s*:/m);
  });
});

describe('Viewport', () => {
  it('ninguna plantilla usa h-screen: en iOS la barra de direcciones lo rompe', () => {
    // `100vh` en Safari de iPhone cuenta la barra que después se esconde, así
    // que la sección salta al hacer scroll. `min-h-dvh` mide lo que se ve.
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      for (const [, clases] of contenido.matchAll(/class="([^"]*)"/g)) {
        if (/\b(h-screen|min-h-screen)\b/.test(clases)) {
          infractores.push(archivo);
        }
      }
    }

    expect(infractores).toEqual([]);
  });
});

describe('Tacto', () => {
  /**
   * El texto sin sus bloques `@media (hover: hover)`.
   *
   * Lo que queda son los `:hover` que un teléfono también aplica.
   */
  function fueraDeConsultaDeHover(fuente: string): string {
    let resultado = '';
    let i = 0;

    while (i < fuente.length) {
      const inicio = fuente.indexOf('@media (hover', i);
      if (inicio === -1) {
        resultado += fuente.slice(i);
        break;
      }

      resultado += fuente.slice(i, inicio);
      let profundidad = 0;
      let j = fuente.indexOf('{', inicio);
      for (; j < fuente.length; j++) {
        if (fuente[j] === '{') profundidad++;
        if (fuente[j] === '}' && --profundidad === 0) break;
      }
      i = j + 1;
    }

    return resultado;
  }

  it('la clase .boton confirma la pulsación', () => {
    // Entre que el dedo baja y que la pantalla responde puede pasar media
    // segundo de red. Sin :active, en todo ese rato el botón parece muerto.
    expect(css).toMatch(/\.boton:active/);
  });

  it('ningún hover queda fuera de su consulta de medios', () => {
    // En un teléfono el navegador aplica :hover al tocar y lo deja pegado hasta
    // que el dedo toca otra cosa: el socio ve un control encendido que no lo
    // está. `@media (hover: hover) and (pointer: fine)` es lo que lo evita.
    const infractores: string[] = [];

    if (/:hover/.test(fueraDeConsultaDeHover(css))) {
      infractores.push('styles.css');
    }

    for (const { archivo, contenido } of plantillas()) {
      const codigo = sinComentarios(contenido);
      // Solo los bloques `styles:` de los componentes: en una plantilla, el
      // `hover:` de Tailwind es otra cosa y no sufre este problema.
      for (const [, estilos] of codigo.matchAll(/styles:\s*`([\s\S]*?)`/g)) {
        if (/:hover/.test(fueraDeConsultaDeHover(estilos))) {
          infractores.push(archivo);
        }
      }
    }

    expect(infractores).toEqual([]);
  });
});

describe('Foco', () => {
  /**
   * El anillo de foco tiene que verse contra lo que rodea al control (WCAG
   * 2.4.7). En claro, `--color-ring` y `--color-campo` son el mismo azul: sobre
   * la banda azul el anillo no existía, y con teclado no se sabía dónde estaba el
   * foco en el hero, en "Libre hoy" ni en el pie. Hallado en TV3.2.
   */
  // En los hijos y no en el contenedor: el anillo se dibuja afuera del control,
  // sobre el fondo de quien lo contiene. El ítem activo del panel es bg-rotulo y
  // su anillo cae sobre la barra clara; si la regla lo alcanzara, se borraría.
  it('sobre el campo y sobre el rótulo, el anillo toma el color del texto', () => {
    expect(css).toMatch(
      /\.bg-campo > \*,\s*\.text-on-campo > \*\s*\{[^}]*--color-ring:\s*var\(--color-on-campo\)/,
    );
    expect(css).toMatch(/\.bg-rotulo > \*\s*\{[^}]*--color-ring:\s*var\(--color-on-rotulo\)/);
  });

  it('el campo hondo, el lado visitante del cara a cara, lleva el texto del campo (TV3.5)', () => {
    for (const [nombre, tema] of TEMAS) {
      expect(
        contraste(colorDe(tema, 'on-campo'), colorDe(tema, 'campo-hondo')),
        `texto sobre el campo hondo, en ${nombre}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('cada anillo se distingue de su fondo, en los dos temas', () => {
    for (const [nombre, tema] of TEMAS) {
      expect(
        contraste(colorDe(tema, 'ring'), colorDe(tema, 'background')),
        `el anillo sobre el fondo, en ${nombre}`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contraste(colorDe(tema, 'on-campo'), colorDe(tema, 'campo')),
        `el anillo sobre el campo, en ${nombre}`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contraste(colorDe(tema, 'on-rotulo'), colorDe(tema, 'rotulo')),
        `el anillo sobre el rótulo, en ${nombre}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Esquinas', () => {
  // Un solo radio en todo el sitio: el lenguaje de transmisión es de esquinas
  // rectas (plan de transmisión, TV1.2). La forma de cumplirlo sin tocar las
  // plantillas que usan rounded-lg, rounded-xl y compañía es redefinir cada
  // variable de radio de Tailwind al mismo valor. Por eso se leen las que trae el
  // Tailwind instalado y no una lista escrita a mano: con la próxima versión, un
  // radio nuevo haría fallar el test en vez de colarse redondeado.
  const deTailwind = readFileSync(
    createRequire(import.meta.url).resolve('tailwindcss/theme.css'),
    'utf8',
  );
  const propios = new Map(
    [...bloque('@theme {').matchAll(/^\s*(--radius(?:-[\w-]+)?):\s*([^;]+);/gm)].map(
      ([, nombre, valor]) => [nombre, valor.trim()],
    ),
  );

  it('redefine cada radio que trae Tailwind', () => {
    const deFabrica = new Set([...deTailwind.matchAll(/(--radius(?:-[\w-]+)?):/g)].map(([, n]) => n));
    const faltan = [...deFabrica].filter((nombre) => !propios.has(nombre));

    expect(deFabrica.size).toBeGreaterThan(0);
    expect(faltan).toEqual([]);
  });

  it('todos los radios valen lo mismo', () => {
    expect(new Set(propios.values())).toEqual(new Set([propios.get('--radius-control')]));
  });

  it('ninguna regla de styles.css escribe un radio a mano', () => {
    // Una regla con `border-radius: 0.5rem` no la alcanza ninguna variable: se
    // queda redondeada aunque el sistema entero sea recto.
    const aMano = [...css.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;]+);/g)]
      .map(([, valor]) => valor.trim())
      .filter((valor) => !valor.startsWith('var(--radius'));

    expect(aMano).toEqual([]);
  });

  it('ninguna plantilla usa un radio arbitrario', () => {
    // `rounded-[10px]` es el único camino que le queda a una plantilla para
    // saltarse el sistema, y no lo alcanza ninguna variable.
    const infractores = plantillas()
      .filter(({ contenido }) => /\brounded(?:-[a-z]+)?-\[/.test(contenido))
      .map(({ archivo }) => archivo);

    expect(infractores).toEqual([]);
  });

  it('rounded-full solo en elementos cuadrados: un avatar o un botón de ícono', () => {
    // Un cuadrado con rounded-full es un círculo, y un avatar redondo es
    // convención, no estilo. Una pastilla de texto es estilo, y en este lenguaje
    // las etiquetas son rótulos rectos.
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      for (const [clases] of contenido.matchAll(/(?:class|claseBoton)="[^"]*\brounded-full\b[^"]*"/g)) {
        if (!/\bsize-\d/.test(clases)) infractores.push(`${archivo}: ${clases.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }

    expect(infractores).toEqual([]);
  });
});

describe('Fotos', () => {
  it('todo <app-foto> dice qué foto va ahí', () => {
    // La descripción hace dos trabajos: es el pedido que el club lee en
    // `docs/fotos-pendientes.md` y es el `alt` cuando la foto llega. Sin ella,
    // el slot no se puede pedir y la imagen termina sin texto alternativo.
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      // El lookahead deja fuera a `<app-foto-del-partido>` y
      // `<app-fotos-del-torneo>`, que son la galería de los torneos.
      for (const [uso] of contenido.matchAll(/<app-foto(?=[\s/>])[\s\S]*?\/>/g)) {
        if (!/\[?descripcion\]?="[^"]+"/.test(uso)) {
          infractores.push(`${archivo}: ${uso.replace(/\s+/g, ' ').slice(0, 70)}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });
});


describe('Tablas', () => {
  it('toda tabla usa la primitiva, no un juego de clases propio', () => {
    // Las cuatro de reportes traían `w-full border-collapse text-sm` y sus
    // propias líneas por fila: dos familias de tabla en el mismo panel, con
    // encabezados distintos y sin cifras tabulares. La primitiva es lo que hace
    // que el padrón y el reporte de ingresos se lean como el mismo sistema.
    //
    // La excepción es el marcador de la portada (TV3.3): no es una tabla de
    // datos sino el tablero de la transmisión, sobre campo. La primitiva le
    // pondría encabezado gris, una línea por fila y un hover gris, y habría que
    // deshacer cada cosa a mano. Va por archivo, no por clase, para que no sea
    // una puerta que cualquier tabla pueda usar.
    const infractores: string[] = [];
    const excepciones = ['catalogo-canchas/marcador.ts'];

    for (const { archivo, contenido } of plantillas()) {
      if (excepciones.some((excepcion) => archivo.endsWith(excepcion))) continue;
      for (const [etiqueta] of sinComentarios(contenido).matchAll(/<table[^>]*>/g)) {
        if (!/class="[^"]*\btabla\b/.test(etiqueta)) {
          infractores.push(`${archivo}: ${etiqueta}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it('la primitiva alinea los números y les da ancho fijo', () => {
    // Sin `tabular-nums` el 1 es más angosto que el 8, y una columna de montos
    // queda con los dígitos desalineados fila a fila: comparar $12.000 con
    // $120.000 de un vistazo deja de ser posible.
    const tabla = css.match(/\.tabla\s*\{[^}]*\}/)?.[0];

    expect(tabla).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(css).toMatch(/\.tabla\s+\.numero/);
  });

  it('el encabezado de columna se queda a la vista, y el de fila no', () => {
    const encabezado = css.match(/\.tabla thead th\s*\{[^}]*\}/)?.[0];

    expect(encabezado).toMatch(/position:\s*sticky/);
    // El `<th scope="row">` es una celda de datos: se estiliza con los `td`.
    expect(css).toMatch(/\.tabla td,\s*\n\s*\.tabla tbody th/);
  });

  it('el encabezado de columna va en la letra de los rótulos', () => {
    // Como una tabla de posiciones en una transmisión: la etiqueta de la columna
    // en la condensada, y los datos en la letra de leer (TV2.1).
    const encabezado = css.match(/\.tabla thead th\s*\{[^}]*\}/)?.[0];

    expect(encabezado).toMatch(/font-family:\s*var\(--font-display\)/);
  });
});

describe('El panel en la A (Fase 7)', () => {
  // Las carpetas ya migradas. Cada tarea de la Fase 7 suma la suya, y en el
  // Checkpoint G la lista es el panel entero: la regla queda cuidando que una
  // pantalla nueva no vuelva al título y a las secciones de antes.
  const MIGRADAS = [
    'catalogo-canchas/admin/',
    'clases/admin/',
    'configuracion/',
    'cuotas/admin/',
    'estado/',
    'identidad/admin/',
    'ranking/admin/',
    'reportes/',
    'reservas/admin/',
    'torneos/admin/',
  ];
  const delPanel = () =>
    plantillas()
      .filter(({ archivo }) => MIGRADAS.some((ruta) => archivo.startsWith(ruta)))
      .map(({ archivo, contenido }) => ({ archivo, contenido: sinComentarios(contenido) }));

  it('el título de cada pantalla va en la cabecera del panel, en cursiva', () => {
    // Adentro de la cabecera y no solo en el mismo archivo, y sin depender del
    // orden de las clases: una cabecera con un margen de más no es una falta.
    const cabecera = /<header\b[^>]*class="[^"]*\bcabecera-panel\b[^"]*"[^>]*>([\s\S]*?)<\/header>/;
    const titular = /<h1\b[^>]*class="[^"]*\btitular\b/;

    const infractores = delPanel()
      .filter(({ contenido }) => /<h1\b/.test(contenido))
      .filter(({ contenido }) => !titular.test(contenido.match(cabecera)?.[1] ?? ''))
      .map(({ archivo }) => archivo);

    expect(infractores).toEqual([]);
  });

  it('la bajada de la cabecera no lleva max-w-prose, que le gana al ancho de la primitiva', () => {
    // Con max-w-prose la bajada se partía en tres líneas y la banda pasaba los 96px
    // en nueve pantallas (revisión de TV7.9). El ancho lo pone .cabecera-panel p.
    const infractores = delPanel()
      .filter(({ contenido }) =>
        [...contenido.matchAll(/<header\b[^>]*\bcabecera-panel\b[\s\S]*?<\/header>/g)].some(
          ([bloque]) => /\bmax-w-prose\b/.test(bloque),
        ),
      )
      .map(({ archivo }) => archivo);

    expect(infractores).toEqual([]);
  });

  it('cada sección visible se encabeza con el rótulo, no con un título suelto', () => {
    // La sección es la que se nombra con aria-labelledby, que es como la arma el
    // panel. El h2 de una tarjeta —el nombre de quien escribió una consulta— o
    // el de un diálogo no encabeza una sección y no lleva placa (TV7.4). El
    // sr-only tampoco: es el nombre de una región para el lector de pantalla, y
    // un rótulo que no se ve no tiene placa que pintar.
    const infractores: string[] = [];

    for (const { archivo, contenido } of delPanel()) {
      for (const [, id] of contenido.matchAll(/<section\b[^>]*aria-labelledby="([^"]+)"/g)) {
        const titulo = contenido.match(new RegExp(`<h2\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
        if (titulo && !/\b(rotulo-seccion|sr-only)\b/.test(titulo)) {
          infractores.push(`${archivo}: ${titulo.replace(/\s+/g, ' ')}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });
});

describe('Botones', () => {
  it('ningún botón ni enlace se arma a mano con relleno y fondo o borde, sin .boton (TV8.2)', () => {
    // TV2.3 encontró tres —"Ir a pagar" con su "Cancelar", "Crear cuenta" y
    // "Sancionar"— que no heredaban nada de .boton: ni el alto táctil, ni la letra,
    // ni el foco, ni la confirmación al apretar. TV2.4, TV5.2 y TV7.9 los migraron;
    // esto cuida que no aparezca el cuarto.
    //
    // Quedan afuera los que no son una acción sino una opción que se marca
    // (aria-pressed, como las horas libres de la grilla) o una pestaña (role="tab"):
    // se dibujan como chip o como pestaña, no como botón.
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      for (const [etiqueta] of sinComentarios(contenido).matchAll(/<(?:button|a)\b[^>]*>/g)) {
        const clases = etiqueta.match(/\bclass="([^"]*)"/)?.[1] ?? '';
        if (/\bboton\b/.test(clases) || /aria-pressed|role="tab"/.test(etiqueta)) continue;

        const relleno = /(?<![\w-])p[xy]?-\d/.test(clases);
        const fondoOBorde = /(?<![\w:-])(bg-(?!transparent)[a-z]|border(?:-\d)?(?=\s|$))/.test(clases);
        if (relleno && fondoOBorde) {
          infractores.push(`${archivo}: ${clases.replace(/\s+/g, ' ').slice(0, 70)}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it('un botón sobre el campo usa su variante y no arma los colores a mano', () => {
    // Seis botones se armaban con `bg-on-campo text-campo` a mano. La variante
    // existe para que la fase 3, que llena la portada de bandas de campo, no
    // repita la mezcla seis veces más (TV2.1).
    const infractores: string[] = [];

    for (const { archivo, contenido } of plantillas()) {
      for (const [clases] of contenido.matchAll(/class="[^"]*\bboton\b[^"]*"/g)) {
        if (/\b(bg|border|text)-on-campo\b|\btext-campo\b/.test(clases)) {
          infractores.push(`${archivo}: ${clases.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });
});

describe('Franjas', () => {
  it('nada se marca con una franja de color al costado', () => {
    // La franja gruesa en el canto (`border-s-4`) es la marca más reconocible de
    // una interfaz hecha en serie, y el detector de impeccable la cazó en D8.2.
    // La última era la del ítem activo del panel; desde TV2.5 el activo es un
    // rótulo, y esto impide que vuelva por otro lado.
    // Los cuatro costados (s, e, l, r, y x para los dos) y también los anchos
    // arbitrarios. Arriba y abajo no: la raya superior de las cifras es parte
    // del lenguaje (TV3.4) y no es una franja al costado.
    const FRANJA = /\bborder-[selrx]-(?:[2-8]\b|\[[^\]]+\])/;
    const infractores = plantillas()
      .filter(({ contenido }) => FRANJA.test(contenido))
      .map(({ archivo }) => archivo);

    expect(infractores).toEqual([]);
  });

  it('styles.css tampoco escribe una franja al costado', () => {
    const franjas = css.match(
      /border-(?:left|right|inline-start|inline-end|inline)(?:-width)?:\s*(?:[2-9]|\d{2})/g,
    );

    expect(franjas).toBeNull();
  });
});

describe('Acabado', () => {
  it('ninguna transición usa la palabra all', () => {
    // `transition: all` anima también lo que nadie quiso animar —un `width` que
    // cambia por el contenido, un `top` que cambia por el layout— y esas dos son
    // las que descartan el hilo de composición y hacen saltar el cuadro.
    const infractores: string[] = [];

    for (const { archivo, contenido } of [...plantillas(), { archivo: 'styles.css', contenido: css }]) {
      if (/transition:\s*all|\btransition-all\b/.test(sinComentarios(contenido))) {
        infractores.push(archivo);
      }
    }

    expect(infractores).toEqual([]);
  });

  it('nada entra desde la nada', () => {
    // `scale(0)` es un elemento que aparece de un punto sin dimensión, y en el
    // mundo real nada hace eso. Se entra desde `scale(0.95)` con opacidad, que
    // es lo que el ojo lee como "esto ya estaba y se acercó".
    const infractores: string[] = [];

    for (const { archivo, contenido } of [...plantillas(), { archivo: 'styles.css', contenido: css }]) {
      if (/scale\(0\)/.test(sinComentarios(contenido))) {
        infractores.push(archivo);
      }
    }

    expect(infractores).toEqual([]);
  });

  it('los diálogos salen más rápido de lo que entran', () => {
    // Al entrar, el diálogo se presenta y conviene verlo llegar. Al salir ya no
    // interesa: lo único que hace una salida lenta es demorar a alguien que ya
    // decidió irse.
    const entrada = css.match(/--duracion-dialogo:\s*(\d+)ms/)?.[1];
    const salida = css.match(/--duracion-salida:\s*(\d+)ms/)?.[1];

    expect(Number(salida)).toBeLessThan(Number(entrada));
  });
});

/**
 * T95. El favicon es la D del logotipo, con la silueta, en blanco sobre el azul de la
 * marca. Hasta acá era el de Angular, que venía con el esqueleto de T1.
 */
describe('Favicon', () => {
  const publico = (archivo: string) => join(process.cwd(), 'public', archivo);
  const html = readFileSync(join(process.cwd(), 'src/index.html'), 'utf8');

  it('index.html declara el SVG, el .ico de respaldo y el ícono del iPhone', () => {
    expect(html).toContain('<link rel="icon" href="favicon.svg" type="image/svg+xml">');
    expect(html).toContain('<link rel="icon" href="favicon.ico" sizes="16x16 32x32 48x48">');
    expect(html).toContain('<link rel="apple-touch-icon" href="apple-touch-icon.png">');
  });

  it('el SVG lleva solo la D y pesa menos de 4 KB: el trazo entero del logo eran 18', () => {
    const svg = readFileSync(publico('favicon.svg'), 'utf8');

    expect(svg.length).toBeLessThan(4096);
    // El azul de la marca: el de "FE" y el del rótulo de la hora.
    expect(svg.toLowerCase()).toContain('#0b4f9e');
  });

  it('el .ico trae 16, 32 y 48 en PNG, y no los BMP del de Angular', () => {
    const ico = readFileSync(publico('favicon.ico'));
    const imagenes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
      const entrada = 6 + 16 * i;
      const desde = ico.readUInt32LE(entrada + 12);
      return {
        lado: ico[entrada] || 256,
        png: ico.subarray(desde, desde + 4).toString('hex') === '89504e47',
      };
    });

    expect(imagenes.map((i) => i.lado).sort((a, b) => a - b)).toEqual([16, 32, 48]);
    expect(imagenes.every((i) => i.png)).toBe(true);
  });

  it('el ícono del iPhone existe: sin él, iOS arma uno con una captura de la página', () => {
    expect(existsSync(publico('apple-touch-icon.png'))).toBe(true);
  });
});
