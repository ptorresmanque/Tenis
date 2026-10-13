-- T172 (Etapa 2, fuera del trabajo de título): el umbral de stock bajo y el texto del
-- arriendo de raquetas, en la fila de configuración del club. Solo agrega columnas.
-- Ver SPEC-tienda.md § Configuración.

-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `arriendo_raquetas_texto` VARCHAR(600) NOT NULL DEFAULT '',
    ADD COLUMN `umbral_stock_bajo` INTEGER NOT NULL DEFAULT 2;

