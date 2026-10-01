import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, effect, inject, signal } from '@angular/core';

/** Los tres estados del conmutador. `auto` es seguir al sistema. */
export type Modo = 'auto' | 'claro' | 'oscuro';

const CLAVE = 'fedal:tema';

/**
 * Qué tema se ve, y quién lo decide.
 *
 * **Tres estados y no dos.** Un interruptor de dos posiciones obliga a elegir
 * entre claro y oscuro para siempre; con `auto` el sitio sigue al sistema, que
 * es lo que hacía antes de que este conmutador existiera y lo que la mayoría
 * espera. Quitar esa opción para simplificar el control sería quitarle al
 * visitante lo que ya tenía.
 *
 * La preferencia se guarda en `localStorage` y sobrevive a la recarga. Si el
 * navegador la niega —modo privado en algunos, almacenamiento lleno— el sitio
 * sigue andando en `auto`: se pierde la preferencia, no la página.
 */
@Service()
export class Tema {
  private readonly documento = inject(DOCUMENT);

  readonly modo = signal<Modo>(this.leerGuardado());

  constructor() {
    effect(() => {
      const modo = this.modo();
      const raiz = this.documento.documentElement;

      // `auto` no escribe nada: la ausencia del atributo es lo que deja mandar a
      // la consulta de `prefers-color-scheme`.
      if (modo === 'auto') raiz.removeAttribute('data-modo');
      else raiz.setAttribute('data-modo', modo);

      this.guardar(modo);
    });
  }

  private leerGuardado(): Modo {
    try {
      const guardado = localStorage.getItem(CLAVE);
      return guardado === 'claro' || guardado === 'oscuro' ? guardado : 'auto';
    } catch {
      return 'auto';
    }
  }

  private guardar(modo: Modo): void {
    try {
      if (modo === 'auto') localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, modo);
    } catch {
      // Que no se pueda guardar la preferencia no es motivo para romper la
      // página: el tema de esta sesión ya quedó aplicado arriba.
    }
  }
}

/**
 * Marca el documento como sitio público, que es lo que habilita el tema oscuro.
 *
 * **El modo oscuro va en las quince pantallas públicas y no en el panel**, y esa
 * no es una omisión: el sitio público se mira de noche desde la cama y el panel
 * se opera de día en el mesón, bajo luz. Teñir veintidós pantallas de tabla para
 * dos personas que nunca lo van a activar es trabajo sin destinatario, y la
 * decisión está fechada en el plan de rediseño.
 *
 * La regla de `styles.css` cuelga de este atributo, así que el panel se queda en
 * claro sin una sola excepción escrita a mano.
 *
 * Lo llaman los dos cascarones que sirven pantallas públicas —el del sitio y el
 * de autenticación—, porque entrar y registro también son públicas. Vive acá y
 * no dentro de uno de ellos para que no haya dos versiones de la misma regla.
 *
 * Se quita al destruir el cascarón: sin eso, entrar al panel desde el menú del
 * avatar dejaría el atributo puesto y la agenda del día saldría en oscuro.
 */
export function usarTemaPublico(): void {
  const raiz = inject(DOCUMENT).documentElement;

  // Instanciar el servicio acá y no en el componente: el efecto que aplica el
  // modo tiene que estar corriendo antes de que se pinte la primera pantalla.
  inject(Tema);

  raiz.setAttribute('data-tema', 'publico');
  inject(DestroyRef).onDestroy(() => raiz.removeAttribute('data-tema'));
}
