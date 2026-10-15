import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { EstadoSocio } from './socios.service';

/** Una fila de la lista de usuarios (T223), como la arma `GET /api/admin/usuarios`. */
export interface UsuarioDeLaLista {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  /** Instante ISO de cuando creó la cuenta. */
  creadoEn: string;
  esAdmin: boolean;
  esGestor: boolean;
  socio: {
    id: number;
    numeroSocio: string;
    estado: EstadoSocio;
    /** Instante ISO del último día pagado (T295). */
    alDiaHasta: string | null;
  } | null;
  profesor: { id: number; nombreVisible: string; activo: boolean } | null;
}

export interface ListadoDeUsuarios {
  usuarios: UsuarioDeLaLista[];
  total: number;
  pagina: number;
  porPagina: number;
  /** Las fichas de profesor activas que no tienen cuenta (SPEC-panel.md D14). */
  profesoresSinCuenta: number;
}

/** Los filtros de Personas (T296), como los entiende la API (T295). Sin tipo: todos. */
export type TipoDePersona = 'socios' | 'profesores' | 'gestores' | 'administradores' | 'sin-tipo';
export type OrdenDePersonas = 'nombre' | 'numero';

/** La ficha de una cuenta en Personas (T298), como la arma `GET /api/admin/usuarios/:id`. */
export interface FichaDeCuenta extends Omit<UsuarioDeLaLista, 'socio' | 'profesor'> {
  socio: {
    id: number;
    numeroSocio: string;
    estado: EstadoSocio;
    /** Fecha civil, como instante ISO a medianoche. */
    alDiaHasta: string;
    sancionadoHasta: string | null;
  } | null;
  profesor: {
    id: number;
    nombreVisible: string;
    telefono: string;
    especialidad: string;
    tarifaHoraClp: number | null;
    activo: boolean;
    /** Para pedir confirmación antes de quitarle el Profesor (SPEC-panel.md A6). */
    clasesPorVenir: number;
  } | null;
}

/** Los tipos que se encienden con una casilla. Socio y profesor son fichas (T224). */
export type CambioDeTipos = Partial<Pick<UsuarioDeLaLista, 'esAdmin' | 'esGestor'>>;

@Service()
export class Usuarios {
  private readonly http = inject(HttpClient);

  /**
   * La búsqueda la hace el servidor: cada palabra en el nombre, el apellido, el correo o el
   * número de socio. El tipo y el orden, desde T296, para Personas.
   */
  listar(
    q: string,
    pagina: number,
    tipo?: TipoDePersona,
    orden?: OrdenDePersonas,
  ): Promise<ListadoDeUsuarios> {
    return firstValueFrom(
      this.http.get<ListadoDeUsuarios>('/api/admin/usuarios', {
        params: { q, pagina, ...(tipo && { tipo }), ...(orden && { orden }) },
      }),
    );
  }

  /** Una cuenta con sus fichas, para su ficha en Personas (T298). */
  ficha(id: number): Promise<FichaDeCuenta> {
    return firstValueFrom(this.http.get<FichaDeCuenta>(`/api/admin/usuarios/${id}`));
  }

  cambiar(id: number, cambio: CambioDeTipos): Promise<UsuarioDeLaLista> {
    return firstValueFrom(this.http.patch<UsuarioDeLaLista>(`/api/admin/usuarios/${id}`, cambio));
  }
}
