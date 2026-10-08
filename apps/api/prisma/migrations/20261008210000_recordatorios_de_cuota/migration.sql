-- CreateTable
CREATE TABLE `recordatorio_cuota` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `socio_id` INTEGER NOT NULL,
    `periodo` VARCHAR(7) NOT NULL,
    `tipo` ENUM('PREVIO', 'VENCIDA') NOT NULL,
    `enviado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `recordatorio_cuota_socio_id_periodo_tipo_key`(`socio_id`, `periodo`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `recordatorio_cuota` ADD CONSTRAINT `recordatorio_cuota_socio_id_fkey` FOREIGN KEY (`socio_id`) REFERENCES `socio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

