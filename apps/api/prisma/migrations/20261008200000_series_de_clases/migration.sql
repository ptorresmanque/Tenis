-- AlterTable
ALTER TABLE `clase` ADD COLUMN `serie_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `serie_de_clases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profesor_id` INTEGER NOT NULL,
    `cancha_id` INTEGER NOT NULL,
    `dias_semana` VARCHAR(13) NOT NULL,
    `hora_desde` CHAR(5) NOT NULL,
    `hora_hasta` CHAR(5) NOT NULL,
    `desde` DATE NOT NULL,
    `hasta` DATE NOT NULL,
    `cupo_maximo` INTEGER NOT NULL,
    `nivel` ENUM('INICIACION', 'INTERMEDIO', 'COMPETITIVO', 'NINOS') NOT NULL,
    `notas` VARCHAR(191) NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `serie_de_clases_cancha_id_idx`(`cancha_id`),
    INDEX `serie_de_clases_profesor_id_idx`(`profesor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `clase_serie_id_idx` ON `clase`(`serie_id`);

-- AddForeignKey
ALTER TABLE `clase` ADD CONSTRAINT `clase_serie_id_fkey` FOREIGN KEY (`serie_id`) REFERENCES `serie_de_clases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serie_de_clases` ADD CONSTRAINT `serie_de_clases_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `profesor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serie_de_clases` ADD CONSTRAINT `serie_de_clases_cancha_id_fkey` FOREIGN KEY (`cancha_id`) REFERENCES `cancha`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

