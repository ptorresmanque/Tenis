import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mide el contraste real de los tokens leyendo styles.css, no una copia.
 * Si alguien cambia un color y rompe WCAG AA, esta suite se cae acá y no en
 * una auditoría de accesibilidad tres meses después.
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

  describe('los dos verdes', () => {
    // Esta es la razón de que existan dos tokens de verde en vez de uno.
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
  });
});

describe('Uso de los tokens en las plantillas', () => {
  // Los tests de arriba miden los colores; este mira cómo se combinan de verdad.
  // Sin él, `bg-accent` con texto blanco pasa desapercibido: fue exactamente el
  // error que se coló al escribir el chip de estado en T3.
  function plantillas(): { archivo: string; contenido: string }[] {
    const raiz = join(process.cwd(), 'src/app');

    return readdirSync(raiz, { recursive: true, encoding: 'utf8' })
      .filter((ruta) => ruta.endsWith('.ts') && !ruta.endsWith('.spec.ts'))
      .map((ruta) => ({
        archivo: ruta,
        contenido: readFileSync(join(raiz, ruta), 'utf8'),
      }));
  }

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
});
