-- T65: cuándo NO puede jugar un inscrito.
--
-- Cuelga de la inscripción y no del jugador: el horario de alguien en marzo no es el de
-- noviembre. Se borra con ella —`ON DELETE CASCADE`—, porque una restricción sin
-- inscripción no significa nada.
CREATE TABLE `restriccion_horaria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inscripcion_id` INTEGER NOT NULL,
    `dia_semana` INTEGER NOT NULL,
    `hora_desde` VARCHAR(5) NOT NULL,
    `hora_hasta` VARCHAR(5) NOT NULL,

    INDEX `restriccion_horaria_inscripcion_id_idx`(`inscripcion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restriccion_horaria` ADD CONSTRAINT `restriccion_horaria_inscripcion_id_fkey` FOREIGN KEY (`inscripcion_id`) REFERENCES `inscripcion_torneo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
