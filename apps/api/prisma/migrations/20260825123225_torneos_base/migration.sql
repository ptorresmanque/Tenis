-- CreateTable
CREATE TABLE `jugador` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `socio_id` INTEGER NULL,
    `nombre` VARCHAR(80) NOT NULL,
    `apellido` VARCHAR(80) NOT NULL,
    `telefono` VARCHAR(40) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `jugador_socio_id_key`(`socio_id`),
    INDEX `jugador_apellido_nombre_idx`(`apellido`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categoria_torneo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `puntos_campeon` INTEGER NOT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `categoria_torneo_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `torneo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(120) NOT NULL,
    `categoria_id` INTEGER NOT NULL,
    `superficie` ENUM('ARCILLA', 'CEMENTO', 'PASTO_SINTETICO') NULL,
    `fecha_inicio` DATE NOT NULL,
    `fecha_fin` DATE NOT NULL,
    `cierre_inscripcion` DATE NOT NULL,
    `cupo` INTEGER NOT NULL,
    `estado` ENUM('INSCRIPCION', 'CUADRO_ARMADO', 'EN_CURSO', 'FINALIZADO', 'CANCELADO') NOT NULL DEFAULT 'INSCRIPCION',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `torneo_estado_fecha_inicio_idx`(`estado`, `fecha_inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `jugador` ADD CONSTRAINT `jugador_socio_id_fkey` FOREIGN KEY (`socio_id`) REFERENCES `socio`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `torneo` ADD CONSTRAINT `torneo_categoria_id_fkey` FOREIGN KEY (`categoria_id`) REFERENCES `categoria_torneo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
