-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `dias_sancion_no_uso` INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE `socio` ADD COLUMN `sancionado_hasta` DATE NULL;

-- CreateTable
CREATE TABLE `reporte_no_uso` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reserva_id` INTEGER NOT NULL,
    `reportante_socio_id` INTEGER NOT NULL,
    `estado` ENUM('PENDIENTE', 'SANCIONADO', 'DESCARTADO') NOT NULL DEFAULT 'PENDIENTE',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resuelto_en` DATETIME(3) NULL,
    `resuelto_por_usuario_id` INTEGER NULL,

    INDEX `reporte_no_uso_estado_idx`(`estado`),
    UNIQUE INDEX `reporte_no_uso_reserva_id_reportante_socio_id_key`(`reserva_id`, `reportante_socio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reporte_no_uso` ADD CONSTRAINT `reporte_no_uso_reserva_id_fkey` FOREIGN KEY (`reserva_id`) REFERENCES `reserva`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reporte_no_uso` ADD CONSTRAINT `reporte_no_uso_reportante_socio_id_fkey` FOREIGN KEY (`reportante_socio_id`) REFERENCES `socio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
