-- T68: la transmisión en vivo, vista dentro del sitio.

-- Columna y no tabla de equipamiento, igual que `techada` e `iluminacion`: es un sí o
-- un no por cancha. Solo las que la tienen se pueden transmitir.
ALTER TABLE `cancha` ADD COLUMN `tiene_camara` BOOLEAN NOT NULL DEFAULT false;

-- **Se transmite una cancha durante una jornada, no un partido.** El club abre un live
-- el sábado a las nueve y lo cierra a las siete, y ese video cubre los ocho partidos
-- que se jugaron ahí; un video por partido obligaría a abrir y cerrar ocho veces en un
-- día de torneo.
--
-- `youtube_video_id` son **once caracteres, nunca una URL**: ese valor termina dentro
-- del `src` de un `iframe`, y el largo de la columna es la última barrera si algún día
-- alguien intenta guardar otra cosa.
CREATE TABLE `transmision` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `torneo_id` INTEGER NOT NULL,
    `cancha_id` INTEGER NOT NULL,
    `youtube_video_id` VARCHAR(11) NOT NULL,
    `inicio` DATETIME(3) NOT NULL,
    `fin` DATETIME(3) NOT NULL,
    `titulo` VARCHAR(120) NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `transmision_cancha_id_inicio_idx`(`cancha_id`, `inicio`),
    INDEX `transmision_torneo_id_idx`(`torneo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `transmision` ADD CONSTRAINT `transmision_torneo_id_fkey` FOREIGN KEY (`torneo_id`) REFERENCES `torneo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `transmision` ADD CONSTRAINT `transmision_cancha_id_fkey` FOREIGN KEY (`cancha_id`) REFERENCES `cancha`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
