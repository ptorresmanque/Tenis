-- CreateTable
CREATE TABLE `transaccion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `referencia` VARCHAR(191) NOT NULL,
    `concepto` ENUM('RESERVA', 'CUOTA') NOT NULL,
    `concepto_id` INTEGER NOT NULL,
    `usuario_id` INTEGER NULL,
    `inicio_bloque_original` DATETIME(3) NULL,
    `monto_clp` INTEGER NOT NULL,
    `estado` ENUM('PENDIENTE', 'AUTORIZADA', 'RECHAZADA', 'ANULADA', 'EXPIRADA') NOT NULL DEFAULT 'PENDIENTE',
    `pasarela` VARCHAR(191) NOT NULL,
    `token_pasarela` VARCHAR(191) NULL,
    `codigo_autorizacion` VARCHAR(191) NULL,
    `ultimos_digitos` VARCHAR(4) NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmada_en` DATETIME(3) NULL,

    UNIQUE INDEX `transaccion_referencia_key`(`referencia`),
    UNIQUE INDEX `transaccion_token_pasarela_key`(`token_pasarela`),
    INDEX `transaccion_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `transaccion` ADD CONSTRAINT `transaccion_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
