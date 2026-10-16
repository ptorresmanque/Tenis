import type { UsuarioActual } from './auth';

type TipoDelPanel = 'gestor' | 'profesor';

/**
 * Qué pantallas del panel ve cada tipo que no es admin (T220, `SPEC-identidad.md` §
 * Tipos de usuario), **en el orden del menú**: la primera que alguien puede ver es su
 * portada.
 *
 * **Lo que no está acá es solo del admin.** Una pantalla nueva nace cerrada para el
 * gestor y el profesor, y abrirla es agregar su línea. Lo leen el guard y el menú, así
 * que un ítem nunca aparece para quien su ruta rechaza. Que el menú esconda algo no es
 * el control: la API responde 403 igual.
 *
 * **Una línea vale para todo lo que cuelga de su ruta, salvo que otra más larga diga otra
 * cosa** (T285). Así la agenda abre `/administracion/reservas?fecha=…` al gestor, y la
 * línea sin tipos le cierra su pestaña de ocupación, que es del admin.
 */
const TIPOS_POR_PANTALLA: [string, TipoDelPanel[]][] = [
  ['/administracion/reservas', ['gestor']],
  ['/administracion/reservas/ocupacion', []],
  ['/administracion/clases', ['profesor']],
];

/** La portada del admin: la primera pantalla de su menú. */
const PORTADA_DEL_ADMIN = '/administracion/reservas';

/**
 * La línea del mapa que manda en esa URL: la más larga que la contiene.
 * `/administracion/clases?fecha=…` y `/administracion/clases/3` caen en `/administracion/clases`.
 */
function lineaDe(url: string): [string, TipoDelPanel[]] | undefined {
  const camino = url.split(/[?#]/)[0];

  return TIPOS_POR_PANTALLA.filter(
    ([ruta]) => camino === ruta || camino.startsWith(`${ruta}/`),
  ).sort(([a], [b]) => b.length - a.length)[0];
}

function tiene(tipos: TipoDelPanel[], usuario: UsuarioActual): boolean {
  return (
    (tipos.includes('gestor') && usuario.esGestor) ||
    (tipos.includes('profesor') && usuario.profesorId !== null)
  );
}

export function puedeVer(url: string, usuario: UsuarioActual | null): boolean {
  if (!usuario) return false;
  if (usuario.esAdmin) return true;

  const tipos = lineaDe(url)?.[1];

  return tipos !== undefined && tiene(tipos, usuario);
}

/** La portada del panel de cada uno, o `null` si no tiene panel. */
export function inicioDelPanel(usuario: UsuarioActual | null): string | null {
  if (!usuario) return null;
  if (usuario.esAdmin) return PORTADA_DEL_ADMIN;

  return (
    TIPOS_POR_PANTALLA.find(([, tipos]) => tiene(tipos, usuario))?.[0] ?? null
  );
}
