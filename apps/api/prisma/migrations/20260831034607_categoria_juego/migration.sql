-- CreateTable
CREATE TABLE `categoria_juego` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(40) NOT NULL,
    `orden` INTEGER NOT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `categoria_juego_nombre_key`(`nombre`),
    UNIQUE INDEX `categoria_juego_orden_key`(`orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
