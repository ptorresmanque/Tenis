-- T69: las fotos del torneo.
--
-- `partido_id` con ON DELETE SET NULL y no CASCADE: si alguien deshace el cuadro, la
-- foto de los dos jugadores sigue siendo una foto del torneo. Perderla sería borrar el
-- recuerdo por un cambio administrativo.
CREATE TABLE `foto_torneo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `torneo_id` INTEGER NOT NULL,
    `partido_id` INTEGER NULL,
    `momento` ENUM('ANTES', 'DURANTE', 'DESPUES') NOT NULL DEFAULT 'DURANTE',
    `ruta_web` VARCHAR(255) NOT NULL,
    `ruta_miniatura` VARCHAR(255) NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `foto_torneo_torneo_id_momento_idx`(`torneo_id`, `momento`),
    INDEX `foto_torneo_partido_id_idx`(`partido_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `foto_torneo` ADD CONSTRAINT `foto_torneo_torneo_id_fkey`
    FOREIGN KEY (`torneo_id`) REFERENCES `torneo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `foto_torneo` ADD CONSTRAINT `foto_torneo_partido_id_fkey`
    FOREIGN KEY (`partido_id`) REFERENCES `partido`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
