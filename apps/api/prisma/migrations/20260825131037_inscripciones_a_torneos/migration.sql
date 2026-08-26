-- CreateTable
CREATE TABLE `inscripcion_torneo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `torneo_id` INTEGER NOT NULL,
    `jugador_id` INTEGER NOT NULL,
    `siembra` INTEGER NULL,
    `estado` ENUM('INSCRITA', 'LISTA_ESPERA', 'RETIRADA') NOT NULL DEFAULT 'INSCRITA',
    `inscrita_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inscripcion_torneo_torneo_id_estado_idx`(`torneo_id`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inscripcion_torneo` ADD CONSTRAINT `inscripcion_torneo_torneo_id_fkey` FOREIGN KEY (`torneo_id`) REFERENCES `torneo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripcion_torneo` ADD CONSTRAINT `inscripcion_torneo_jugador_id_fkey` FOREIGN KEY (`jugador_id`) REFERENCES `jugador`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lo que Prisma no modela, a mano: la misma columna generada de `reserva.inicio_activo`
-- y `inscripcion_clase.socio_activo`.
--
-- El único no puede ir sobre (torneo_id, jugador_id): quien se retira por una lesión y
-- se recupera antes del cierre tiene que poder volver, y su fila se queda para que el
-- club vea que se bajó. `jugador_activo` vale su id mientras ocupa lugar y NULL cuando
-- se retiró, y en MySQL dos NULL no chocan.
--
-- La deriva la base y no la aplicación: una columna que el código tiene que acordarse
-- de anular al retirar es una que alguien va a olvidar, y el síntoma sería un jugador
-- que no puede volver a inscribirse nunca.
ALTER TABLE `inscripcion_torneo`
  ADD COLUMN `jugador_activo` INTEGER
  AS (IF(`estado` = 'RETIRADA', NULL, `jugador_id`)) VIRTUAL;

CREATE UNIQUE INDEX `inscripcion_jugador_activo`
  ON `inscripcion_torneo` (`torneo_id`, `jugador_activo`);
