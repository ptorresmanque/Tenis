/**
 * Las variantes de la insignia (T258), que es un `mat-chip` sin interacción dentro de su
 * `mat-chip-set`. El color de cada una está en el tema (`$insignias`, en `tema-material.scss`);
 * acá, su ícono.
 *
 * **Cada variante trae su ícono además de su color.** Es la regla del master, no decoración: el
 * par verde/rojo es justo el que no distingue quien tiene daltonismo rojo-verde, así que un estado
 * comunicado solo por color no se comunica. Ícono y texto lo dicen igual en blanco y negro.
 */
export type VarianteInsignia = 'exito' | 'aviso' | 'error' | 'info' | 'neutro' | 'libre';

export const ICONO_DE_INSIGNIA: Record<VarianteInsignia, string> = {
  exito: 'check_circle',
  aviso: 'schedule',
  error: 'cancel',
  info: 'info',
  neutro: 'history',
  libre: 'circle',
};
