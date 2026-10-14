import { Injectable, Provider } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

/**
 * Los textos de `mat-paginator` en español (T259).
 *
 * La cuenta dice la página y no el tramo de filas: «Página 2 de 3», como la paginación de antes.
 * Siempre al menos una: «Página 1 de 0» no existe. Va en una región viva, así que quien no ve
 * la tabla se entera de que cambió de página, y el foco se queda en el botón que apretó.
 */
@Injectable()
export class PaginadorEnEspanol extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Por página';
  override nextPageLabel = 'Página siguiente';
  override previousPageLabel = 'Página anterior';
  override firstPageLabel = 'Primera página';
  override lastPageLabel = 'Última página';

  override getRangeLabel = (pagina: number, porPagina: number, total: number) =>
    `Página ${pagina + 1} de ${Math.max(1, Math.ceil(total / porPagina))}`;
}

/**
 * Por componente y no en la aplicación, como `proveerCampos()`: en `app.config` arrastraría el
 * paginador al arranque.
 */
export function proveerPaginador(): Provider {
  return { provide: MatPaginatorIntl, useClass: PaginadorEnEspanol };
}
