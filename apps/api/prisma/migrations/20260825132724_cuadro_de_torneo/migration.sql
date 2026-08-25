-- AlterTable
ALTER TABLE `torneo` ADD COLUMN `semilla_sorteo` INTEGER NULL;

-- CreateTable
CREATE TABLE `partido` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `torneo_id` INTEGER NOT NULL,
    `ronda` INTEGER NOT NULL,
    `posicion` INTEGER NOT NULL,
    `jugador_a_id` INTEGER NULL,
    `jugador_b_id` INTEGER NULL,
    `ganador_id` INTEGER NULL,
    `marcador` VARCHAR(60) NULL,
    `walkover` BOOLEAN NOT NULL DEFAULT false,
    `jugado_en` DATETIME(3) NULL,

    INDEX `partido_torneo_id_idx`(`torneo_id`),
    UNIQUE INDEX `partido_torneo_id_ronda_posicion_key`(`torneo_id`, `ronda`, `posicion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `partido` ADD CONSTRAINT `partido_torneo_id_fkey` FOREIGN KEY (`torneo_id`) REFERENCES `torneo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partido` ADD CONSTRAINT `partido_jugador_a_id_fkey` FOREIGN KEY (`jugador_a_id`) REFERENCES `jugador`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partido` ADD CONSTRAINT `partido_jugador_b_id_fkey` FOREIGN KEY (`jugador_b_id`) REFERENCES `jugador`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partido` ADD CONSTRAINT `partido_ganador_id_fkey` FOREIGN KEY (`ganador_id`) REFERENCES `jugador`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
