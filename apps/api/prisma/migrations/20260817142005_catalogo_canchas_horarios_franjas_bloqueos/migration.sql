-- CreateTable
CREATE TABLE `cancha` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `superficie` ENUM('ARCILLA', 'CEMENTO', 'PASTO_SINTETICO') NOT NULL,
    `techada` BOOLEAN NOT NULL DEFAULT false,
    `iluminacion` BOOLEAN NOT NULL DEFAULT false,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `cancha_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horario_apertura` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cancha_id` INTEGER NULL,
    `dia_semana` INTEGER NOT NULL,
    `hora_apertura` VARCHAR(5) NOT NULL,
    `hora_cierre` VARCHAR(5) NOT NULL,

    INDEX `horario_apertura_cancha_id_dia_semana_idx`(`cancha_id`, `dia_semana`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `franja_horaria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cancha_id` INTEGER NULL,
    `dia_semana` INTEGER NULL,
    `hora_desde` VARCHAR(5) NOT NULL,
    `hora_hasta` VARCHAR(5) NOT NULL,
    `es_pico` BOOLEAN NOT NULL DEFAULT false,
    `monto_clp` INTEGER NOT NULL,
    `vigente_desde` DATE NOT NULL,
    `vigente_hasta` DATE NULL,

    INDEX `franja_horaria_cancha_id_dia_semana_idx`(`cancha_id`, `dia_semana`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bloqueo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cancha_id` INTEGER NOT NULL,
    `inicio` DATETIME(3) NOT NULL,
    `fin` DATETIME(3) NOT NULL,
    `motivo` ENUM('MANTENCION', 'TORNEO', 'CLASE', 'OTRO') NOT NULL,
    `descripcion` VARCHAR(191) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bloqueo_cancha_id_inicio_idx`(`cancha_id`, `inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_club` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `duracion_bloque_min` INTEGER NOT NULL DEFAULT 60,
    `cupo_diario_socio_horas` INTEGER NOT NULL DEFAULT 1,
    `cupo_pico_semanal_horas` INTEGER NOT NULL DEFAULT 2,
    `invitados_por_mes` INTEGER NOT NULL DEFAULT 4,
    `horas_min_modificacion` INTEGER NOT NULL DEFAULT 6,
    `horas_reembolso_total` INTEGER NOT NULL DEFAULT 24,
    `actualizado_en` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    -- Escrito a mano: Prisma no modela CHECK constraints, y sin él "exactamente una
    -- fila" sería una convención que cualquier cliente de SQL puede romper. La
    -- primary key impide la segunda fila con id 1; esto impide todas las demás.
    CONSTRAINT `configuracion_club_fila_unica` CHECK (`id` = 1)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `horario_apertura` ADD CONSTRAINT `horario_apertura_cancha_id_fkey` FOREIGN KEY (`cancha_id`) REFERENCES `cancha`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `franja_horaria` ADD CONSTRAINT `franja_horaria_cancha_id_fkey` FOREIGN KEY (`cancha_id`) REFERENCES `cancha`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bloqueo` ADD CONSTRAINT `bloqueo_cancha_id_fkey` FOREIGN KEY (`cancha_id`) REFERENCES `cancha`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

