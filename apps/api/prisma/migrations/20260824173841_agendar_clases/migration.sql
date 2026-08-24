-- CreateTable
CREATE TABLE `clase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profesor_id` INTEGER NOT NULL,
    `cancha_id` INTEGER NOT NULL,
    `inicio` DATETIME(3) NOT NULL,
    `fin` DATETIME(3) NOT NULL,
    `cupo_maximo` INTEGER NOT NULL,
    `nivel` ENUM('INICIACION', 'INTERMEDIO', 'COMPETITIVO', 'NINOS') NOT NULL,
    `estado` ENUM('PROGRAMADA', 'REALIZADA', 'CANCELADA') NOT NULL DEFAULT 'PROGRAMADA',
    `bloqueo_id` INTEGER NULL,
    `notas` VARCHAR(191) NULL,
    `cancelada_en` DATETIME(3) NULL,
    `motivo_cancelacion` VARCHAR(191) NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `clase_bloqueo_id_key`(`bloqueo_id`),
    INDEX `clase_inicio_idx`(`inicio`),
    INDEX `clase_cancha_id_inicio_idx`(`cancha_id`, `inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `clase` ADD CONSTRAINT `clase_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `profesor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clase` ADD CONSTRAINT `clase_cancha_id_fkey` FOREIGN KEY (`cancha_id`) REFERENCES `cancha`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clase` ADD CONSTRAINT `clase_bloqueo_id_fkey` FOREIGN KEY (`bloqueo_id`) REFERENCES `bloqueo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
