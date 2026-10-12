-- T144. Las preguntas frecuentes del club, que escribe desde su panel.
CREATE TABLE `pregunta_frecuente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pregunta` VARCHAR(191) NOT NULL,
    `respuesta` TEXT NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizada_en` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
