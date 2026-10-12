-- T156 (Etapa 2, fuera del trabajo de título): el catálogo de la tienda empieza por sus
-- categorías, sus marcas y la tabla de tallas de cada marca. Solo agrega: no toca ninguna
-- tabla existente. Ver SPEC-tienda.md § Modelo de datos.

-- CreateTable
CREATE TABLE `categoria_producto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `usa_tabla_de_tallas` BOOLEAN NOT NULL DEFAULT false,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizada_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categoria_producto_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marca` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizada_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `marca_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `equivalencia_talla` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `marca_id` INTEGER NOT NULL,
    `talla_cl` VARCHAR(10) NOT NULL,
    `talla_us` VARCHAR(10) NOT NULL,
    `talla_eu` VARCHAR(10) NOT NULL,

    UNIQUE INDEX `equivalencia_talla_marca_id_talla_cl_key`(`marca_id`, `talla_cl`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `equivalencia_talla` ADD CONSTRAINT `equivalencia_talla_marca_id_fkey` FOREIGN KEY (`marca_id`) REFERENCES `marca`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Las seis categorías con que abre la tienda, en el orden del club. Van en la migración y no
-- en el seed porque el seed no corre en producción, y sin categorías no se puede cargar un
-- producto. Zapatillas es la única que usa la tabla de tallas.
INSERT INTO `categoria_producto` (`nombre`, `orden`, `usa_tabla_de_tallas`, `actualizada_en`) VALUES
    ('Zapatillas', 1, true, CURRENT_TIMESTAMP(3)),
    ('Raquetas', 2, false, CURRENT_TIMESTAMP(3)),
    ('Ropa', 3, false, CURRENT_TIMESTAMP(3)),
    ('Pelotas', 4, false, CURRENT_TIMESTAMP(3)),
    ('Cuerdas', 5, false, CURRENT_TIMESTAMP(3)),
    ('Accesorios', 6, false, CURRENT_TIMESTAMP(3));
