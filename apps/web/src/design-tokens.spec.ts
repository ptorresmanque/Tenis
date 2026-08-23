import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { VARIANTES_AVISO } from './app/ui/aviso';
import { VARIANTES_INSIGNIA } from './app/ui/insignia';

/**
 * Lint del sistema de diseño.
 *
 * La referencia visual es el proyecto de Stitch "Club de Tenis — reservas y
 * administración" (FEDAL), volcado en design-system/club-de-tenis/MASTER.md.
 * Esta suite es lo que impide que el código se aleje de esa referencia sin que
 * nadie se entere.
 *
 * Mide el contraste real de los tokens leyendo styles.css, no una copia. Si
 * alguien cambia un color y rompe WCAG AA, la suite se cae acá y no en una
 * auditoría de accesibilidad tres meses después.
 */

// El runner de tests de Angular corre desde apps/web. No se usa import.meta.url:
// dentro del bundle de test no resuelve a una ruta de archivo.
const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

function tokensDeColor(): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, nombre, valor] of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)) {
    tokens.set(nombre, valor);
  }
  return tokens;
}

const COLORES = tokensDeColor();

function color(nombre: string): string {
  const valor = COLORES.get(nombre);
  if (!valor) {
    throw new Error(`El token --color-${nombre} no existe en styles.css`);
  }
  return valor;
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

describe('Contraste de los tokens de color', () => {
  // Cada par es una combinación que la interfaz usa de verdad.
  const paresDeTexto: readonly [string, string, string][] = [
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

  it.each(paresDeTexto)('%s cumple AA para texto normal (4.5:1)', (_, frente, fondo) => {
    expect(contraste(color(frente), color(fondo))).toBeGreaterThanOrEqual(4.5);
  });

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

  function familias(): string[] {
    const declaradas = new Set<string>();

    for (const [, valor] of css.matchAll(/--font-[\w-]+:\s*([^;]+);/g)) {
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

  it.each(familias())('index.html carga la fuente %s', (familia) => {
    expect(html).toContain(`family=${familia.replaceAll(' ', '+')}`);
  });

  it('la fuente de íconos se carga y no con display=swap', () => {
    // Material Symbols dibuja con ligaduras: con swap el usuario ve escrito
    // "check_circle" hasta que la fuente carga.
    const enlace = html.match(/https:\/\/[^"']*Material\+Symbols[^"']*/)?.[0];

    expect(enlace).toBeDefined();
    expect(enlace).toContain('display=block');
  });

  it('los íconos usan clase propia y no la de Google', () => {
    // `.material-symbols-outlined` de Google viene sin capa y le gana a toda
    // utilidad de Tailwind: con esa clase, text-* sobre un ícono no hace nada.
    // La clase propia .icono está en @layer base y sí se deja mandar.
    expect(css).toContain('.icono');

    const infractores = plantillas()
      .filter(({ contenido }) => contenido.includes('material-symbols-outlined'))
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
