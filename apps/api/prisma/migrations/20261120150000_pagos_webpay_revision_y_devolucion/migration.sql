-- T395 (SPEC-panel.md § Los pagos del club, Modelo de datos): lo que dice Webpay al confirmar
-- (el tipo de pago, el número de cuotas, el código de respuesta y el motivo del rechazo), la revisión
-- desde Finanzas › Pagos y la devolución (cuándo, quién y por qué). Solo agrega columnas nulas:
-- los pagos de antes quedan con nulos, que la pantalla dice como «—». Quien revisó o devolvió
-- queda con ON DELETE SET NULL, como el usuario del pago: el registro sobrevive a la baja.
-- AlterTable
ALTER TABLE `transaccion` ADD COLUMN `anulada_en` DATETIME(3) NULL,
    ADD COLUMN `anulada_por` INTEGER NULL,
    ADD COLUMN `codigo_respuesta` INTEGER NULL,
    ADD COLUMN `numero_cuotas` INTEGER NULL,
    ADD COLUMN `motivo_anulacion` VARCHAR(200) NULL,
    ADD COLUMN `motivo_rechazo` VARCHAR(200) NULL,
    ADD COLUMN `nota_revision` VARCHAR(200) NULL,
    ADD COLUMN `revisada_en` DATETIME(3) NULL,
    ADD COLUMN `revisada_por` INTEGER NULL,
    ADD COLUMN `tipo_pago` VARCHAR(2) NULL;

-- CreateIndex
CREATE INDEX `transaccion_revisada_por_idx` ON `transaccion`(`revisada_por`);

-- CreateIndex
CREATE INDEX `transaccion_anulada_por_idx` ON `transaccion`(`anulada_por`);

-- AddForeignKey
ALTER TABLE `transaccion` ADD CONSTRAINT `transaccion_revisada_por_fkey` FOREIGN KEY (`revisada_por`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transaccion` ADD CONSTRAINT `transaccion_anulada_por_fkey` FOREIGN KEY (`anulada_por`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
