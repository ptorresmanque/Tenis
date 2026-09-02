-- AlterTable
ALTER TABLE `inscripcion_torneo` ADD COLUMN `torneo_categoria_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `partido` ADD COLUMN `torneo_categoria_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `torneo_categoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `torneo_id` INTEGER NOT NULL,
    `categoria_juego_id` INTEGER NOT NULL,
    `cupo` INTEGER NOT NULL,
    `monto_inscripcion_clp` INTEGER NOT NULL DEFAULT 0,
    `semilla_sorteo` INTEGER NULL,

    INDEX `torneo_categoria_categoria_juego_id_idx`(`categoria_juego_id`),
    UNIQUE INDEX `torneo_categoria_torneo_id_categoria_juego_id_key`(`torneo_id`, `categoria_juego_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `inscripcion_torneo_torneo_categoria_id_idx` ON `inscripcion_torneo`(`torneo_categoria_id`);

-- CreateIndex
CREATE INDEX `partido_torneo_categoria_id_idx` ON `partido`(`torneo_categoria_id`);

-- AddForeignKey
ALTER TABLE `torneo_categoria` ADD CONSTRAINT `torneo_categoria_torneo_id_fkey` FOREIGN KEY (`torneo_id`) REFERENCES `torneo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `torneo_categoria` ADD CONSTRAINT `torneo_categoria_categoria_juego_id_fkey` FOREIGN KEY (`categoria_juego_id`) REFERENCES `categoria_juego`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripcion_torneo` ADD CONSTRAINT `inscripcion_torneo_torneo_categoria_id_fkey` FOREIGN KEY (`torneo_categoria_id`) REFERENCES `torneo_categoria`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partido` ADD CONSTRAINT `partido_torneo_categoria_id_fkey` FOREIGN KEY (`torneo_categoria_id`) REFERENCES `torneo_categoria`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill. Escrito a mano: Prisma genera el DDL, no el traspaso de los datos.
--
-- Va DESPUÉS de las claves foráneas a propósito. Así la base valida cada fila que
-- se escribe acá abajo, y un backfill que apunte a un id inventado revienta la
-- migración en vez de dejar el historial mal enganchado y en silencio.
--
-- Es la parte de las fases 12 a 15 que puede perder el historial de los torneos ya
-- jugados, y no hay de dónde reconstruirlo. Lo que la comprueba está en
-- `test/torneos-categorias-del-torneo.spec.ts` § el backfill de la migración.
-- ─────────────────────────────────────────────────────────────────────────────

-- Los torneos que ya existen no tienen categoría de juego: se jugaron antes de que
-- el concepto existiera. Se les inventa una, y **decir eso es más honesto que
-- repartirlos en la 4ª o en Honor**, que sería atribuirles un nivel que nadie eligió.
--
-- `orden = 0` la deja debajo de todas y, sobre todo, **fuera del alcance del panel**:
-- el lector del DTO acepta 1..1000, así que nadie puede crear otra ahí ni mover una
-- categoría real a ese lugar. `activa = 0` la mantiene fuera de los selectores.
--
-- Solo se crea si hay torneos que rellenar: una base nueva no necesita esta fila.
INSERT IGNORE INTO `categoria_juego` (`nombre`, `orden`, `activa`)
SELECT 'Sin categoría', 0, 0 FROM DUAL WHERE EXISTS (SELECT 1 FROM `torneo`);

-- Un cuadro por torneo existente, que hereda su cupo y su semilla. Con un solo
-- cuadro por torneo, el comportamiento del cuadro no cambia: es lo que permite que
-- la suite de torneos siga pasando sin tocar un test.
INSERT INTO `torneo_categoria` (`torneo_id`, `categoria_juego_id`, `cupo`, `monto_inscripcion_clp`, `semilla_sorteo`)
SELECT t.`id`, cj.`id`, t.`cupo`, 0, t.`semilla_sorteo`
FROM `torneo` t
CROSS JOIN `categoria_juego` cj
WHERE cj.`nombre` = 'Sin categoría';

-- Cada inscripción y cada partido al cuadro **de su propio torneo**. El JOIN va por
-- `torneo_id`, y es correcto porque acá cada torneo tiene exactamente un cuadro: el
-- que se acaba de crear arriba.
UPDATE `inscripcion_torneo` i
JOIN `torneo_categoria` tc ON tc.`torneo_id` = i.`torneo_id`
SET i.`torneo_categoria_id` = tc.`id`;

UPDATE `partido` p
JOIN `torneo_categoria` tc ON tc.`torneo_id` = p.`torneo_id`
SET p.`torneo_categoria_id` = tc.`id`;
