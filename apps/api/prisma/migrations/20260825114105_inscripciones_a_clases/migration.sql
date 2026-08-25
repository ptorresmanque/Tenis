-- CreateTable
CREATE TABLE `inscripcion_clase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clase_id` INTEGER NOT NULL,
    `socio_id` INTEGER NULL,
    `nombre` VARCHAR(120) NULL,
    `telefono` VARCHAR(40) NULL,
    `estado` ENUM('INSCRITA', 'CANCELADA', 'ASISTIO', 'FALTO') NOT NULL DEFAULT 'INSCRITA',
    `inscrita_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inscripcion_clase_clase_id_idx`(`clase_id`),
    INDEX `inscripcion_clase_socio_id_idx`(`socio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inscripcion_clase` ADD CONSTRAINT `inscripcion_clase_clase_id_fkey` FOREIGN KEY (`clase_id`) REFERENCES `clase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripcion_clase` ADD CONSTRAINT `inscripcion_clase_socio_id_fkey` FOREIGN KEY (`socio_id`) REFERENCES `socio`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Lo que Prisma no modela y por eso va a mano, igual que `inicio_activo` en `reserva`
-- y el CHECK de `configuracion_club`.

-- **La regla completa era "socio o alumno de afuera, exactamente uno", y la base no
-- la puede imponer.** MariaDB no deja que una columna con foreign key participe en un
-- CHECK: responde "Function or expression socio_id cannot be used in the CHECK
-- clause", por ALTER y dentro del CREATE. Es el mismo muro contra el que se estrelló
-- `acompanante_reserva`, y la decisión es la misma: entre la foreign key y el CHECK
-- gana la foreign key, que garantiza que el socio existe y limpia la fila cuando se
-- da de baja. La mitad que involucra a `socio_id` la impone `Inscripciones`, con test.
--
-- Lo que sí se puede imponer acá es la otra mitad, que no toca la foreign key: el
-- alumno de afuera **no puede quedar sin teléfono**. Es por donde el club lo llama
-- cuando el profesor se enferma, y una fila sin teléfono no se distingue de una que
-- se cargó a medias.
ALTER TABLE `inscripcion_clase`
  ADD CONSTRAINT `inscripcion_alumno_con_telefono` CHECK (
    (`nombre` IS NULL AND `telefono` IS NULL)
    OR (`nombre` IS NOT NULL AND `telefono` IS NOT NULL)
  );

-- El único no puede ir sobre (clase_id, socio_id): un socio que canceló tiene que
-- poder volver a inscribirse y su fila sigue ahí para el historial. `socio_activo`
-- vale su id mientras ocupa cupo y NULL cuando ya no, y en MySQL dos NULL no chocan.
--
-- El alumno de afuera lo tiene siempre nulo, así que dos homónimos conviven: son dos
-- personas distintas y el club las distingue por el teléfono.
--
-- La deriva la base y no la aplicación: una columna que el código tiene que acordarse
-- de anular al cancelar es una que alguien va a olvidar, y el síntoma sería un cupo
-- que no se libera nunca.
ALTER TABLE `inscripcion_clase`
  ADD COLUMN `socio_activo` INTEGER
  AS (IF(`estado` = 'CANCELADA', NULL, `socio_id`)) VIRTUAL;

CREATE UNIQUE INDEX `inscripcion_socio_activo`
  ON `inscripcion_clase` (`clase_id`, `socio_activo`);
