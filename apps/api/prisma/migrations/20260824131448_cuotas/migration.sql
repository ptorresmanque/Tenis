-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `cuota_mensual_clp` INTEGER NOT NULL DEFAULT 25000;

-- CreateTable
CREATE TABLE `cuota` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `socio_id` INTEGER NOT NULL,
    `tipo` ENUM('INCORPORACION', 'MENSUAL') NOT NULL DEFAULT 'MENSUAL',
    `periodo` VARCHAR(7) NOT NULL,
    `monto_clp` INTEGER NOT NULL,
    `descuento_clp` INTEGER NOT NULL DEFAULT 0,
    `motivo_descuento` VARCHAR(200) NULL,
    `estado` ENUM('PENDIENTE', 'PAGADA', 'ANULADA') NOT NULL DEFAULT 'PENDIENTE',
    `emitida_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `pagada_en` DATETIME(3) NULL,
    `medio` ENUM('WEBPAY', 'EFECTIVO', 'TRANSFERENCIA') NULL,
    `transaccion_id` INTEGER NULL,
    `registrada_por` INTEGER NULL,
    `anulada_por` INTEGER NULL,
    `motivo_anulacion` VARCHAR(200) NULL,

    INDEX `cuota_periodo_estado_idx`(`periodo`, `estado`),
    UNIQUE INDEX `cuota_socio_id_tipo_periodo_key`(`socio_id`, `tipo`, `periodo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cuota` ADD CONSTRAINT `cuota_socio_id_fkey` FOREIGN KEY (`socio_id`) REFERENCES `socio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
