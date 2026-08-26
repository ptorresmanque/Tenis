-- CreateTable
CREATE TABLE `solicitud_contacto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` ENUM('SOCIO', 'CLASES', 'EMPRESA', 'OTRO') NOT NULL,
    `nombre` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `telefono` VARCHAR(40) NOT NULL,
    `mensaje` VARCHAR(1000) NULL,
    `estado` ENUM('NUEVA', 'ATENDIDA', 'DESCARTADA') NOT NULL DEFAULT 'NUEVA',
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atendida_en` DATETIME(3) NULL,
    `atendida_por` INTEGER NULL,
    `nota` VARCHAR(500) NULL,
    `invitacion_id` INTEGER NULL,

    INDEX `solicitud_contacto_estado_creada_en_idx`(`estado`, `creada_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
