-- Recuperar la contraseña: el enlace que deja elegir una nueva, con el mismo trato que
-- el de verificación (solo el hash, nunca el token).
ALTER TABLE `usuario` ADD COLUMN `recuperacion_expira_en` DATETIME(3) NULL,
    ADD COLUMN `recuperacion_token_hash` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `usuario_recuperacion_token_hash_key` ON `usuario`(`recuperacion_token_hash`);
