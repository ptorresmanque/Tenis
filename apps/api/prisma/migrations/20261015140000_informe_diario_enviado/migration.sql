-- T275: los días en que salió el informe de reservas por correo. Se registra antes de mandar,
-- para que dos corridas del cron el mismo día no lo repitan.
-- CreateTable
CREATE TABLE `informe_diario_enviado` (
    `fecha` DATE NOT NULL,
    `enviado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`fecha`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

