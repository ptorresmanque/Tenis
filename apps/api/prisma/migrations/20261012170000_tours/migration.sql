-- T188. Los tours (SPEC-tours.md § Modelo de datos): la liga, sus temporadas, los niveles de
-- cada temporada con su tabla de puntos, la galería y la asociación con los torneos, que
-- escribe `torneos` desde T196. Todo nuevo y vacío: no toca una sola tabla existente.
--
-- La cascada va de tour a temporada a nivel; los dos RESTRICT de torneo_tour son los que
-- impiden borrar un tour, una temporada o un nivel que tenga torneos.

-- CreateTable
CREATE TABLE `tour` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `descripcion` TEXT NOT NULL,
    `imagen_ruta_web` VARCHAR(255) NULL,
    `imagen_ruta_miniatura` VARCHAR(255) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tour_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `temporada_tour` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tour_id` INTEGER NOT NULL,
    `nombre` VARCHAR(40) NOT NULL,
    `fecha_inicio` DATE NOT NULL,
    `fecha_fin` DATE NOT NULL,

    UNIQUE INDEX `temporada_tour_tour_id_nombre_key`(`tour_id`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nivel_temporada` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `temporada_id` INTEGER NOT NULL,
    `nombre` VARCHAR(40) NOT NULL,
    `puntos_campeon` INTEGER NOT NULL,
    `puntos_finalista` INTEGER NOT NULL,
    `puntos_semifinal` INTEGER NOT NULL,
    `puntos_cuartos` INTEGER NOT NULL,
    `puntos_octavos` INTEGER NOT NULL,
    `puntos_dieciseisavos` INTEGER NOT NULL,
    `puntos_treintaidosavos` INTEGER NOT NULL,

    UNIQUE INDEX `nivel_temporada_temporada_id_nombre_key`(`temporada_id`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `foto_tour` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tour_id` INTEGER NOT NULL,
    `ruta_web` VARCHAR(255) NOT NULL,
    `ruta_miniatura` VARCHAR(255) NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `foto_tour_tour_id_creada_en_idx`(`tour_id`, `creada_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `torneo_tour` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `torneo_id` INTEGER NOT NULL,
    `tour_id` INTEGER NOT NULL,
    `nivel_id` INTEGER NOT NULL,

    INDEX `torneo_tour_tour_id_idx`(`tour_id`),
    INDEX `torneo_tour_nivel_id_idx`(`nivel_id`),
    UNIQUE INDEX `torneo_tour_torneo_id_tour_id_key`(`torneo_id`, `tour_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `temporada_tour` ADD CONSTRAINT `temporada_tour_tour_id_fkey` FOREIGN KEY (`tour_id`) REFERENCES `tour`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `nivel_temporada` ADD CONSTRAINT `nivel_temporada_temporada_id_fkey` FOREIGN KEY (`temporada_id`) REFERENCES `temporada_tour`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `foto_tour` ADD CONSTRAINT `foto_tour_tour_id_fkey` FOREIGN KEY (`tour_id`) REFERENCES `tour`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `torneo_tour` ADD CONSTRAINT `torneo_tour_torneo_id_fkey` FOREIGN KEY (`torneo_id`) REFERENCES `torneo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `torneo_tour` ADD CONSTRAINT `torneo_tour_tour_id_fkey` FOREIGN KEY (`tour_id`) REFERENCES `tour`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `torneo_tour` ADD CONSTRAINT `torneo_tour_nivel_id_fkey` FOREIGN KEY (`nivel_id`) REFERENCES `nivel_temporada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

