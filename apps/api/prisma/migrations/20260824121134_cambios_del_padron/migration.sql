-- CreateTable
CREATE TABLE `cambio_socio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `socio_id` INTEGER NOT NULL,
    `campo` VARCHAR(40) NOT NULL,
    `valor_anterior` VARCHAR(80) NOT NULL,
    `valor_nuevo` VARCHAR(80) NOT NULL,
    `hecho_por` INTEGER NOT NULL,
    `hecho_por_nombre` VARCHAR(120) NOT NULL,
    `hecho_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `motivo` VARCHAR(200) NULL,

    INDEX `cambio_socio_socio_id_hecho_en_idx`(`socio_id`, `hecho_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
