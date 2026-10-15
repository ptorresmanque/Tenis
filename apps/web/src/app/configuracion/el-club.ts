import { Component } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';

import { DatosDelClub } from './datos-del-club';
import { PreguntasFrecuentesPanel } from './preguntas-frecuentes';
import { TextosDelSitio } from './textos-del-sitio';

/**
 * La pestaña «El club» de Configuración (T290, SPEC-panel.md D11): los datos del club, los
 * textos del sitio y las preguntas frecuentes, que eran tres pestañas. Todo es lo que el sitio
 * dice del club, y se toca pocas veces al año.
 *
 * Un panel por parte, cerrados: quien entra viene a cambiar una. Con `matExpansionPanelContent`
 * cada formulario se crea, y pide lo suyo, recién al abrir su panel.
 */
@Component({
  selector: 'app-el-club',
  imports: [MatExpansionModule, DatosDelClub, TextosDelSitio, PreguntasFrecuentesPanel],
  template: `
    <!-- multi: abrir una parte no cierra otra, que puede tener cambios sin guardar. -->
    <mat-accordion multi>
      <mat-expansion-panel>
        <mat-expansion-panel-header>
          <mat-panel-title>Datos del club</mat-panel-title>
        </mat-expansion-panel-header>
        <ng-template matExpansionPanelContent>
          <app-datos-del-club />
        </ng-template>
      </mat-expansion-panel>

      <mat-expansion-panel>
        <mat-expansion-panel-header>
          <mat-panel-title>Textos del sitio</mat-panel-title>
        </mat-expansion-panel-header>
        <ng-template matExpansionPanelContent>
          <app-textos-del-sitio />
        </ng-template>
      </mat-expansion-panel>

      <mat-expansion-panel>
        <mat-expansion-panel-header>
          <mat-panel-title>Preguntas frecuentes</mat-panel-title>
        </mat-expansion-panel-header>
        <ng-template matExpansionPanelContent>
          <app-preguntas-frecuentes />
        </ng-template>
      </mat-expansion-panel>
    </mat-accordion>
  `,
})
export class ElClub {}
