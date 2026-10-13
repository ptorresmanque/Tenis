-- T228: cada día de una serie lleva su horario y su cancha (SPEC-clases.md § Series con un
-- horario por día y clases en el gimnasio). Va en este orden a propósito: la tabla nueva,
-- los datos de las series que ya existen, y recién después se borran las columnas viejas.

-- CreateTable
CREATE TABLE `dia_de_serie` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serie_id` INTEGER NOT NULL,
    `dia_semana` INTEGER NOT NULL,
    `hora_desde` CHAR(5) NOT NULL,
    `hora_hasta` CHAR(5) NOT NULL,
    `cancha_id` INTEGER NULL,

    INDEX `dia_de_serie_cancha_id_idx`(`cancha_id`),
    UNIQUE INDEX `dia_de_serie_serie_id_dia_semana_key`(`serie_id`, `dia_semana`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Cada serie de hoy pasa a un renglón por cada día de su `dias_semana` ("2,4"), con su
-- mismo horario y su misma cancha. Ninguna clase cambia: ya son filas propias.
INSERT INTO `dia_de_serie` (`serie_id`, `dia_semana`, `hora_desde`, `hora_hasta`, `cancha_id`)
  SELECT `id`, 0, `hora_desde`, `hora_hasta`, `cancha_id` FROM `serie_de_clases` WHERE FIND_IN_SET('0', `dias_semana`) > 0;
INSERT INTO `dia_de_serie` (`serie_id`, `dia_semana`, `hora_desde`, `hora_hasta`, `cancha_id`)
  SELECT `id`, 1, `hora_desde`, `hora_hasta`, `cancha_id` FROM `serie_de_clases` WHERE FIND_IN_SET('1', `dias_semana`) > 0;
INSERT INTO `dia_de_serie` (`serie_id`, `dia_semana`, `hora_desde`, `hora_hasta`, `cancha_id`)
  SELECT `id`, 2, `hora_desde`, `hora_hasta`, `cancha_id` FROM `serie_de_clases` WHERE FIND_IN_SET('2', `dias_semana`) > 0;
INSERT INTO `dia_de_serie` (`serie_id`, `dia_semana`, `hora_desde`, `hora_hasta`, `cancha_id`)
  SELECT `id`, 3, `hora_desde`, `hora_hasta`, `cancha_id` FROM `serie_de_clases` WHERE FIND_IN_SET('3', `dias_semana`) > 0;
INSERT INTO `dia_de_serie` (`serie_id`, `dia_semana`, `hora_desde`, `hora_hasta`, `cancha_id`)
  SELECT `id`, 4, `hora_desde`, `hora_hasta`, `cancha_id` FROM `serie_de_clases` WHERE FIND_IN_SET('4', `dias_semana`) > 0;
INSERT INTO `dia_de_serie` (`serie_id`, `dia_semana`, `hora_desde`, `hora_hasta`, `cancha_id`)
  SELECT `id`, 5, `hora_desde`, `hora_hasta`, `cancha_id` FROM `serie_de_clases` WHERE FIND_IN_SET('5', `dias_semana`) > 0;
INSERT INTO `dia_de_serie` (`serie_id`, `dia_semana`, `hora_desde`, `hora_hasta`, `cancha_id`)
  SELECT `id`, 6, `hora_desde`, `hora_hasta`, `cancha_id` FROM `serie_de_clases` WHERE FIND_IN_SET('6', `dias_semana`) > 0;

-- AddForeignKey
ALTER TABLE `dia_de_serie` ADD CONSTRAINT `dia_de_serie_serie_id_fkey` FOREIGN KEY (`serie_id`) REFERENCES `serie_de_clases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dia_de_serie` ADD CONSTRAINT `dia_de_serie_cancha_id_fkey` FOREIGN KEY (`cancha_id`) REFERENCES `cancha`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE `serie_de_clases` DROP FOREIGN KEY `serie_de_clases_cancha_id_fkey`;

-- DropIndex
DROP INDEX `serie_de_clases_cancha_id_idx` ON `serie_de_clases`;

-- AlterTable
ALTER TABLE `serie_de_clases` DROP COLUMN `cancha_id`,
    DROP COLUMN `dias_semana`,
    DROP COLUMN `hora_desde`,
    DROP COLUMN `hora_hasta`;
