-- T235: el gimnasio del club, un tercer lugar como la tienda y la cafetería (SPEC.md § El
-- gimnasio): sus tres textos, sus fotos en la misma tabla y la lista de sus tarifas.
-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `gimnasio_descripcion` VARCHAR(600) NOT NULL DEFAULT '',
    ADD COLUMN `gimnasio_horario` VARCHAR(120) NOT NULL DEFAULT '',
    ADD COLUMN `gimnasio_whatsapp` VARCHAR(40) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `foto_lugar` MODIFY `lugar` ENUM('TIENDA', 'CAFETERIA', 'GIMNASIO') NOT NULL;

-- CreateTable
CREATE TABLE `tarifa_gimnasio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `precio_socio_clp` INTEGER NOT NULL,
    `precio_no_socio_clp` INTEGER NOT NULL,
    `orden` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

