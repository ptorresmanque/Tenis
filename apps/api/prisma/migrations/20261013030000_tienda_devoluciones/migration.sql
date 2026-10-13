-- T174: cancelar y devolver. Una devolución por cada plata que vuelve al comprador, y
-- cuántas unidades de cada línea ya se devolvieron.
-- AlterTable
ALTER TABLE `linea_pedido` ADD COLUMN `cantidad_devuelta` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `devolucion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedido_id` INTEGER NOT NULL,
    `monto_clp` INTEGER NOT NULL,
    `medio` ENUM('WEBPAY', 'TRANSFERENCIA', 'EFECTIVO') NOT NULL,
    `repone_stock` BOOLEAN NOT NULL,
    `motivo` VARCHAR(500) NOT NULL,
    `registrada_por_id` INTEGER NOT NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `devolucion_pedido_id_idx`(`pedido_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `devolucion` ADD CONSTRAINT `devolucion_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

