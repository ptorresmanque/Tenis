-- T185. Las fotos de la tienda y la cafetería, para la portada y «El club». Hasta seis
-- por lugar, que valida la API.
CREATE TABLE `foto_lugar` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lugar` ENUM('TIENDA', 'CAFETERIA') NOT NULL,
    `ruta_web` VARCHAR(255) NOT NULL,
    `ruta_miniatura` VARCHAR(255) NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `foto_lugar_lugar_creada_en_idx`(`lugar`, `creada_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
