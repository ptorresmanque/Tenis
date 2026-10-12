-- T164 (Etapa 2, fuera del trabajo de título): los pedidos de la tienda y sus líneas, y
-- PEDIDO como concepto de pago. Solo agrega: la única tabla existente que cambia es
-- transaccion, que suma un valor a su enum. Ver SPEC-tienda.md § Pedidos.

-- AlterTable
ALTER TABLE `transaccion` MODIFY `concepto` ENUM('RESERVA', 'CUOTA', 'INSCRIPCION_TORNEO', 'PEDIDO') NOT NULL;

-- CreateTable
CREATE TABLE `pedido` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(36) NOT NULL,
    `canal` ENUM('EN_LINEA', 'MESON') NOT NULL,
    `estado` ENUM('PENDIENTE_PAGO', 'PAGADO', 'LISTO_PARA_RETIRO', 'DESPACHADO', 'ENTREGADO', 'CANCELADO', 'EXPIRADO') NOT NULL,
    `entrega` ENUM('RETIRO', 'DESPACHO', 'EN_MESON') NOT NULL,
    `requiere_revision` BOOLEAN NOT NULL DEFAULT false,
    `usuario_id` INTEGER NULL,
    `socio_id` INTEGER NULL,
    `nombre` VARCHAR(120) NOT NULL DEFAULT '',
    `email` VARCHAR(120) NOT NULL DEFAULT '',
    `telefono` VARCHAR(40) NOT NULL DEFAULT '',
    `region` VARCHAR(60) NULL,
    `comuna` VARCHAR(80) NULL,
    `direccion` VARCHAR(200) NULL,
    `referencia` VARCHAR(200) NULL,
    `numero_seguimiento` VARCHAR(60) NULL,
    `total_clp` INTEGER NOT NULL,
    `descuento_socio_clp` INTEGER NOT NULL DEFAULT 0,
    `medio_pago` ENUM('WEBPAY', 'TARJETA_MESON', 'EFECTIVO', 'TRANSFERENCIA') NOT NULL,
    `registrado_por_id` INTEGER NULL,
    `documento` ENUM('VOUCHER', 'BOLETA', 'FACTURA') NOT NULL,
    `folio_documento` VARCHAR(40) NULL,
    `factura_rut` VARCHAR(12) NULL,
    `factura_razon_social` VARCHAR(120) NULL,
    `factura_giro` VARCHAR(120) NULL,
    `factura_direccion` VARCHAR(200) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `pagado_en` DATETIME(3) NULL,
    `listo_en` DATETIME(3) NULL,
    `despachado_en` DATETIME(3) NULL,
    `entregado_en` DATETIME(3) NULL,
    `cancelado_en` DATETIME(3) NULL,
    `cancelado_por_id` INTEGER NULL,
    `motivo_cancelacion` VARCHAR(500) NULL,
    `recordatorio_retiro_en` DATETIME(3) NULL,
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pedido_token_key`(`token`),
    INDEX `pedido_estado_canal_creado_en_idx`(`estado`, `canal`, `creado_en`),
    INDEX `pedido_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `linea_pedido` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedido_id` INTEGER NOT NULL,
    `tipo` ENUM('PRODUCTO', 'SERVICIO_ENCORDADO') NOT NULL DEFAULT 'PRODUCTO',
    `variante_id` INTEGER NULL,
    `descripcion` VARCHAR(255) NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precio_unitario_clp` INTEGER NOT NULL,
    `descuento_unitario_clp` INTEGER NOT NULL DEFAULT 0,
    `es_encargo` BOOLEAN NOT NULL DEFAULT false,

    INDEX `linea_pedido_variante_id_idx`(`variante_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `linea_pedido` ADD CONSTRAINT `linea_pedido_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `linea_pedido` ADD CONSTRAINT `linea_pedido_variante_id_fkey` FOREIGN KEY (`variante_id`) REFERENCES `variante`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

