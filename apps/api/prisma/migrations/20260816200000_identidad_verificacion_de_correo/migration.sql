-- AlterTable
ALTER TABLE `usuario` ADD COLUMN `verificacion_expira_en` DATETIME(3) NULL,
    ADD COLUMN `verificacion_token_hash` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `usuario_verificacion_token_hash_key` ON `usuario`(`verificacion_token_hash`);

