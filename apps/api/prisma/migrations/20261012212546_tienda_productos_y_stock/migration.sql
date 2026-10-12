-- T158 (Etapa 2, fuera del trabajo de título): los productos de la tienda, sus fotos, sus
-- variantes y el historial del stock. Solo agrega: no toca ninguna tabla existente. Ver
-- SPEC-tienda.md § Catálogo y § Stock.

-- CreateTable
CREATE TABLE `producto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(120) NOT NULL,
    `descripcion` TEXT NOT NULL,
    `categoria_id` INTEGER NOT NULL,
    `marca_id` INTEGER NULL,
    `precio_clp` INTEGER NOT NULL,
    `publicado` BOOLEAN NOT NULL DEFAULT false,
    `archivado` BOOLEAN NOT NULL DEFAULT false,
    `acepta_encargo` BOOLEAN NOT NULL DEFAULT false,
    `dias_encargo` INTEGER NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `producto_publicado_archivado_categoria_id_idx`(`publicado`, `archivado`, `categoria_id`),
    INDEX `producto_categoria_id_idx`(`categoria_id`),
    INDEX `producto_marca_id_idx`(`marca_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `foto_producto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `producto_id` INTEGER NOT NULL,
    `ruta_web` VARCHAR(255) NOT NULL,
    `ruta_miniatura` VARCHAR(255) NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `foto_producto_producto_id_orden_idx`(`producto_id`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `variante` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `producto_id` INTEGER NOT NULL,
    `etiqueta` VARCHAR(40) NOT NULL,
    `codigo_barras` VARCHAR(64) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizada_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `variante_codigo_barras_key`(`codigo_barras`),
    UNIQUE INDEX `variante_producto_id_etiqueta_key`(`producto_id`, `etiqueta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimiento_stock` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `variante_id` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `motivo` ENUM('ENTRADA', 'VENTA', 'AJUSTE', 'DEVOLUCION', 'ANULACION') NOT NULL,
    `usuario_id` INTEGER NULL,
    `nota` VARCHAR(300) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `movimiento_stock_variante_id_creado_en_idx`(`variante_id`, `creado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `producto` ADD CONSTRAINT `producto_categoria_id_fkey` FOREIGN KEY (`categoria_id`) REFERENCES `categoria_producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producto` ADD CONSTRAINT `producto_marca_id_fkey` FOREIGN KEY (`marca_id`) REFERENCES `marca`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `foto_producto` ADD CONSTRAINT `foto_producto_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `variante` ADD CONSTRAINT `variante_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimiento_stock` ADD CONSTRAINT `movimiento_stock_variante_id_fkey` FOREIGN KEY (`variante_id`) REFERENCES `variante`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

