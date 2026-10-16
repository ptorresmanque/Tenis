-- T225: las observaciones del mesón sobre una reserva (SPEC-reservas.md § Observaciones del mesón).
-- CreateTable
CREATE TABLE `observacion_reserva` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reserva_id` INTEGER NOT NULL,
    `texto` VARCHAR(500) NOT NULL,
    `autor_id` INTEGER NOT NULL,
    `autor_nombre` VARCHAR(120) NOT NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `editada_en` DATETIME(3) NULL,

    INDEX `observacion_reserva_reserva_id_idx`(`reserva_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `observacion_reserva` ADD CONSTRAINT `observacion_reserva_reserva_id_fkey` FOREIGN KEY (`reserva_id`) REFERENCES `reserva`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

