/*
  El andamio del spike de T2 se va: Reserva impone la misma restricción de verdad.
*/
-- DropTable
DROP TABLE IF EXISTS `prueba_unicidad`;

-- CreateTable
CREATE TABLE `reserva` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `folio` VARCHAR(191) NOT NULL,
    `cancha_id` INTEGER NOT NULL,
    `inicio` DATETIME(3) NOT NULL,
    `fin` DATETIME(3) NOT NULL,
    `estado` ENUM('PENDIENTE_PAGO', 'CONFIRMADA', 'CANCELADA', 'EXPIRADA') NOT NULL,
    `es_pico` BOOLEAN NOT NULL DEFAULT false,
    `socio_id` INTEGER NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `telefono` VARCHAR(191) NOT NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cancelada_en` DATETIME(3) NULL,

    UNIQUE INDEX `reserva_folio_key`(`folio`),
    INDEX `reserva_cancha_id_inicio_idx`(`cancha_id`, `inicio`),
    INDEX `reserva_socio_id_inicio_idx`(`socio_id`, `inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
--
-- Un acompañante es un socio del club o un invitado externo, nunca los dos ni
-- ninguno, y esa regla NO se puede imponer acá: MariaDB no deja que una columna con
-- foreign key participe en un CHECK constraint. Responde
--   Function or expression socio_id cannot be used in the CHECK clause
-- tanto por ALTER como dentro del CREATE. Verificado contra MariaDB 11.4 en las dos
-- formas antes de rendirse.
--
-- Entre la foreign key y el CHECK gana la foreign key: garantiza que el socio existe
-- y limpia la fila cuando se da de baja. La regla de socio-o-invitado la impone
-- ReservaRepository, con su test.
CREATE TABLE `acompanante_reserva` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reserva_id` INTEGER NOT NULL,
    `socio_id` INTEGER NULL,
    `nombre` VARCHAR(191) NULL,

    INDEX `acompanante_reserva_reserva_id_idx`(`reserva_id`),
    INDEX `acompanante_reserva_socio_id_idx`(`socio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- La unicidad del bloque, impuesta por la base (SPEC-reservas.md § La unicidad la
-- impone la base). Escrita a mano porque Prisma no modela columnas generadas, igual
-- que el CHECK de configuracion_club en T9.
--
-- El único no puede ir sobre (cancha_id, inicio): una reserva cancelada tiene que
-- liberar la hora y su fila sigue ahí para el historial. inicio_activo vale
-- inicio mientras la reserva ocupa el bloque y NULL cuando ya no, y en MySQL dos
-- NULL no chocan entre sí: conviven todas las canceladas y a lo sumo una activa.
--
-- La deriva la base y no la aplicación a propósito: una columna que el código tiene
-- que acordarse de anular al cancelar es una que alguien va a olvidar, y el síntoma
-- sería un bloque que no vuelve a estar libre nunca.
ALTER TABLE `reserva`
  ADD COLUMN `inicio_activo` DATETIME(3)
  AS (IF(`estado` IN ('PENDIENTE_PAGO', 'CONFIRMADA'), `inicio`, NULL)) VIRTUAL;

CREATE UNIQUE INDEX `reserva_bloque_activo` ON `reserva` (`cancha_id`, `inicio_activo`);

-- AddForeignKey
ALTER TABLE `reserva` ADD CONSTRAINT `reserva_cancha_id_fkey` FOREIGN KEY (`cancha_id`) REFERENCES `cancha`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reserva` ADD CONSTRAINT `reserva_socio_id_fkey` FOREIGN KEY (`socio_id`) REFERENCES `socio`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acompanante_reserva` ADD CONSTRAINT `acompanante_reserva_reserva_id_fkey` FOREIGN KEY (`reserva_id`) REFERENCES `reserva`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acompanante_reserva` ADD CONSTRAINT `acompanante_reserva_socio_id_fkey` FOREIGN KEY (`socio_id`) REFERENCES `socio`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
