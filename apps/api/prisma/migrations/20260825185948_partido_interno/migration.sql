-- CreateTable
CREATE TABLE `partido_interno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `socio_a_id` INTEGER NOT NULL,
    `socio_b_id` INTEGER NOT NULL,
    `ganador_socio_id` INTEGER NOT NULL,
    `marcador` VARCHAR(60) NULL,
    `jugado_en` DATE NOT NULL,
    `estado` ENUM('PENDIENTE', 'CONFIRMADO', 'RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
    `cargado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmado_en` DATETIME(3) NULL,
    `resuelto_por_admin` BOOLEAN NOT NULL DEFAULT false,

    INDEX `partido_interno_estado_jugado_en_cargado_en_idx`(`estado`, `jugado_en`, `cargado_en`),
    INDEX `partido_interno_socio_a_id_idx`(`socio_a_id`),
    INDEX `partido_interno_socio_b_id_idx`(`socio_b_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `partido_interno` ADD CONSTRAINT `partido_interno_socio_a_id_fkey` FOREIGN KEY (`socio_a_id`) REFERENCES `socio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partido_interno` ADD CONSTRAINT `partido_interno_socio_b_id_fkey` FOREIGN KEY (`socio_b_id`) REFERENCES `socio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partido_interno` ADD CONSTRAINT `partido_interno_ganador_socio_id_fkey` FOREIGN KEY (`ganador_socio_id`) REFERENCES `socio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
