-- CreateTable
CREATE TABLE `sesion` (
    `token_hash` VARCHAR(191) NOT NULL,
    `usuario_id` INTEGER NOT NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expira_en` DATETIME(3) NOT NULL,

    INDEX `sesion_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`token_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sesion` ADD CONSTRAINT `sesion_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

