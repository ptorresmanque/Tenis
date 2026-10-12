-- T161 (Etapa 2, fuera del trabajo de título): el porcentaje de descuento del socio en la
-- tienda. Nace en 15, lo que fijó el club. Ver SPEC-tienda.md § Precio y descuento de socio.

-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `descuento_socio_porcentaje` INTEGER NOT NULL DEFAULT 15;
