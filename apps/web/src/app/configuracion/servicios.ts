import { Component } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';

import { Lugar } from '../catalogo-canchas/admin/admin-canchas.service';
import { LugarDelClubPanel } from './lugar-del-club';

/**
 * La pestaña «Servicios» de Configuración (T290, SPEC-panel.md D11): la tienda, la cafetería y
 * el gimnasio, que eran tres pestañas con el mismo formulario (T236). Un panel por lugar,
 * cerrados, y cada formulario se crea al abrir el suyo.
 */
@Component({
  selector: 'app-servicios',
  imports: [MatExpansionModule, LugarDelClubPanel],
  template: `
    <!-- multi: abrir una parte no cierra otra, que puede tener cambios sin guardar. -->
    <mat-accordion multi>
      @for (servicio of SERVICIOS; track servicio.lugar) {
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>{{ servicio.nombre }}</mat-panel-title>
          </mat-expansion-panel-header>
          <ng-template matExpansionPanelContent>
            <app-lugar-del-club [lugar]="servicio.lugar" />
          </ng-template>
        </mat-expansion-panel>
      }
    </mat-accordion>
  `,
})
export class Servicios {
  protected readonly SERVICIOS: { lugar: Lugar; nombre: string }[] = [
    { lugar: 'TIENDA', nombre: 'Tienda' },
    { lugar: 'CAFETERIA', nombre: 'Cafetería' },
    { lugar: 'GIMNASIO', nombre: 'Gimnasio' },
  ];
}
