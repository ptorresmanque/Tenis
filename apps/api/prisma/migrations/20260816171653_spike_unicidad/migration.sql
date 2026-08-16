-- CreateTable
CREATE TABLE `prueba_unicidad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recurso_id` INTEGER NOT NULL,
    `inicio` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prueba_unicidad_recurso_id_inicio_key`(`recurso_id`, `inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
