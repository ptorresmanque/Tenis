-- CreateTable
CREATE TABLE `invitacion_socio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `numero_socio` VARCHAR(191) NOT NULL,
    `al_dia_hasta` DATE NOT NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usada_en` DATETIME(3) NULL,

    UNIQUE INDEX `invitacion_socio_email_key`(`email`),
    UNIQUE INDEX `invitacion_socio_numero_socio_key`(`numero_socio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
