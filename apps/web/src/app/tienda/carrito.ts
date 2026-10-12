import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Lo único que guarda el navegador: qué y cuánto. */
export interface LineaDelCarrito {
  varianteId: number;
  cantidad: number;
}

/** Espejo de `LineaCotizada` en la API (T163). */
export interface LineaCotizada {
  varianteId: number;
  cantidad: number;
  /** Nulo si la variante ya no existe: no se sabe ni qué era. */
  producto: { id: number; nombre: string; marca: string | null; foto: string | null } | null;
  talla: string | null;
  /** Nulo si ya no se vende. */
  precioUnitarioClp: number | null;
  descuentoUnitarioClp: number;
  subtotalClp: number;
  disponible: number;
  estado: 'ok' | 'sin-stock' | 'no-disponible';
}

/** Espejo de `Cotizacion` en la API. */
export interface Cotizacion {
  lineas: LineaCotizada[];
  subtotalClp: number;
  descuentoClp: number;
  totalClp: number;
  sePuedePagar: boolean;
}

const CLAVE = 'fedal:carrito';

/**
 * El pedido que salió de este carrito rumbo a Webpay (T166). En `sessionStorage`, como la
 * marca de `torneos/publico/pago-pendiente`: es de esta pestaña y esta visita.
 */
const CLAVE_PAGANDO = 'fedal:carrito-pagando';

/** Lo que la API acepta de una variante (`CANTIDAD_MAXIMA` en `carrito.dto.ts`). */
export const CANTIDAD_MAXIMA = 99;

/**
 * El carrito de la tienda (T163).
 *
 * **Vive en `localStorage` y guarda solo ids y cantidades** (`SPEC-tienda.md` § Comprar en
 * línea): sobrevive a recargar y a iniciar sesión en el mismo navegador, y no sigue al
 * comprador a otro dispositivo, que el club no pidió. **Los precios no se guardan**: los
 * pone `cotizar` cada vez, así que lo que diga el navegador sobre un precio no llega a
 * ningún lado.
 *
 * Si el navegador niega el almacenamiento —modo privado en algunos—, el carrito dura lo
 * que dura la pestaña, como el tema.
 */
@Service()
export class Carrito {
  private readonly http = inject(HttpClient);

  readonly lineas = signal<LineaDelCarrito[]>(leerGuardado());

  readonly unidades = computed(() =>
    this.lineas().reduce((total, linea) => total + linea.cantidad, 0),
  );

  constructor() {
    effect(() => guardar(this.lineas()));
  }

  /**
   * Suma a lo que ya había de esa variante. Una cantidad que no es un entero desde 1 no
   * entra: la API rechazaría el carrito entero, y la página quedaría sin nada que quitar.
   */
  agregar(varianteId: number, cantidad: number): void {
    if (!Number.isInteger(cantidad) || cantidad < 1) return;

    const ya = this.lineas().find((l) => l.varianteId === varianteId)?.cantidad ?? 0;

    if (ya > 0) this.cambiar(varianteId, ya + cantidad);
    else this.lineas.update((lineas) => [...lineas, { varianteId, cantidad: tope(cantidad) }]);
  }

  /** Cero o menos la quita; lo que no es un entero no cambia nada. */
  cambiar(varianteId: number, cantidad: number): void {
    if (!Number.isInteger(cantidad)) return;
    if (cantidad < 1) return this.quitar(varianteId);

    this.lineas.update((lineas) =>
      lineas.map((l) =>
        l.varianteId === varianteId ? { varianteId, cantidad: tope(cantidad) } : l,
      ),
    );
  }

  /** Antes de ir a Webpay (T166): qué pedido sale de este carrito. */
  recordarPago(token: string): void {
    try {
      sessionStorage.setItem(CLAVE_PAGANDO, token);
    } catch {
      // Sin dónde recordarlo, el carrito no se vacía solo al volver: se quita a mano.
    }
  }

  /**
   * Un pedido se vio pagado (T166). **Se vacía solo si salió de este carrito, y una vez**:
   * el mismo pedido abierto más tarde desde el correo, con otra compra en camino, no tiene
   * por qué borrarla.
   */
  pagado(token: string): void {
    try {
      if (sessionStorage.getItem(CLAVE_PAGANDO) !== token) return;
      sessionStorage.removeItem(CLAVE_PAGANDO);
    } catch {
      return;
    }

    this.lineas.set([]);
  }

  quitar(varianteId: number): void {
    this.lineas.update((lineas) => lineas.filter((l) => l.varianteId !== varianteId));
  }

  cotizar(lineas: LineaDelCarrito[]): Promise<Cotizacion> {
    // Se arma de nuevo y no se manda el arreglo tal cual: solo estos dos campos salen.
    const cuerpo = { lineas: lineas.map(({ varianteId, cantidad }) => ({ varianteId, cantidad })) };

    return firstValueFrom(this.http.post<Cotizacion>('/api/tienda/carrito/cotizar', cuerpo));
  }
}

function tope(cantidad: number): number {
  return Math.min(Math.trunc(cantidad), CANTIDAD_MAXIMA);
}

/**
 * Lo que no es una línea con id y cantidad enteros se descarta, y un precio también. Una
 * variante repetida queda una vez: la API rechaza el carrito que la trae dos veces.
 */
function leerGuardado(): LineaDelCarrito[] {
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
    if (!Array.isArray(guardado)) return [];
    const vistas = new Set<number>();

    return guardado.flatMap((linea: unknown) => {
      const { varianteId, cantidad } = (linea ?? {}) as Record<string, unknown>;
      const valida =
        Number.isInteger(varianteId) &&
        (varianteId as number) > 0 &&
        !vistas.has(varianteId as number) &&
        Number.isInteger(cantidad) &&
        (cantidad as number) > 0;
      if (!valida) return [];

      vistas.add(varianteId as number);
      return [{ varianteId: varianteId as number, cantidad: tope(cantidad as number) }];
    });
  } catch {
    return [];
  }
}

function guardar(lineas: LineaDelCarrito[]): void {
  try {
    if (lineas.length === 0) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, JSON.stringify(lineas));
  } catch {
    // Sin dónde guardar, el carrito dura lo que dura la pestaña. No es motivo para romperla.
  }
}
