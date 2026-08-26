-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `cobra_incorporacion_desde` DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN `cuota_incorporacion_clp` INTEGER NOT NULL DEFAULT 150000;
