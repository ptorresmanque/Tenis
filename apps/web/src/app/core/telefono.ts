import { Pipe, PipeTransform } from '@angular/core';

/**
 * Cómo se muestra un teléfono guardado (T120).
 *
 * La API guarda `56` más los 9 dígitos; acá se lee como se dicta: `+56 9 8765 4321`. El
 * móvil y el fijo de Santiago van 1-4-4; el fijo de región, con su área de dos dígitos,
 * 2-3-4. Es la misma regla que `mostrarTelefono` de la API, que firma los correos.
 *
 * Lo que no está en esa forma —un dato de antes que la migración no pudo leer— se muestra
 * como vino: mejor verlo tal cual que perderlo.
 */
@Pipe({ name: 'telefono' })
export class TelefonoPipe implements PipeTransform {
  transform(guardado: string | null | undefined): string {
    if (!guardado) return '';
    if (!/^56\d{9}$/.test(guardado)) return guardado;

    const n = guardado.slice(2);

    return n.startsWith('9') || n.startsWith('2')
      ? `+56 ${n[0]} ${n.slice(1, 5)} ${n.slice(5)}`
      : `+56 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  }
}

/**
 * El `href` de un teléfono: `tel:+56987654321`. Con el `+` y sin espacios, que es lo que
 * marca bien desde cualquier teléfono, también uno con chip de afuera.
 */
@Pipe({ name: 'enlaceTelefono' })
export class EnlaceTelefonoPipe implements PipeTransform {
  transform(guardado: string | null | undefined): string {
    return `tel:+${(guardado ?? '').replace(/\D/g, '')}`;
  }
}
