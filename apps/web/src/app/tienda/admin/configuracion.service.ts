import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Espejo de `ConfiguracionDeLaTienda` en la API (T172). */
export interface ConfiguracionDeLaTienda {
  descuentoSocioPorcentaje: number;
  umbralStockBajo: number;
  arriendoRaquetasTexto: string;
}

/** La configuración de la tienda, para su pestaña del panel. */
@Service()
export class ConfiguracionDeLaTiendaApi {
  private readonly http = inject(HttpClient);

  leer(): Promise<ConfiguracionDeLaTienda> {
    return firstValueFrom(
      this.http.get<ConfiguracionDeLaTienda>('/api/admin/tienda/configuracion'),
    );
  }

  guardar(cambio: Partial<ConfiguracionDeLaTienda>): Promise<ConfiguracionDeLaTienda> {
    return firstValueFrom(
      this.http.patch<ConfiguracionDeLaTienda>('/api/admin/tienda/configuracion', cambio),
    );
  }
}
