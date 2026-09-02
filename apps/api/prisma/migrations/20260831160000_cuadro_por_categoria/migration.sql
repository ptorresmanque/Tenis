-- ─────────────────────────────────────────────────────────────────────────────
-- T62: el cuadro cuelga de la categoría. La mitad **contraer** del cambio de eje.
--
-- Escrita a mano y no generada: **el orden es el contenido de esta migración.**
-- El re-backfill tiene que correr ANTES del `NOT NULL`, y Prisma los habría puesto
-- al revés. Con el orden invertido, esta migración falla al aplicarse.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Re-backfill ───────────────────────────────────────────────────────────
--
-- **No es una repetición defensiva del de T61: hay filas nuevas que rellenar.**
-- Entre T61 y T62, `inscripciones.service.ts` siguió creando inscripciones sin
-- `torneo_categoria_id` —era la mitad "expandir" y nadie escribía esa columna—, así
-- que toda inscripción hecha en esa ventana es huérfana. Comprobado con una sonda al
-- revisar T61: inscribir por el camino normal dejaba la columna en nulo.
--
-- Es la lección de la fase: una fase de expansión sin **escritura doble** deja una
-- invariante que se degrada sola, y la contracción tiene que barrer lo que quedó.

INSERT IGNORE INTO `categoria_juego` (`nombre`, `orden`, `activa`)
SELECT 'Sin categoría', 0, 0 FROM DUAL
WHERE EXISTS (
  SELECT 1 FROM `torneo` t
  WHERE NOT EXISTS (SELECT 1 FROM `torneo_categoria` tc WHERE tc.`torneo_id` = t.`id`)
);

-- Un cuadro para cada torneo que no tenga ninguno. **El `NOT EXISTS` es lo que hace
-- esto idempotente**, al revés que el backfill de T61: sin él, los torneos que ya
-- tienen cuadro recibirían un segundo y chocarían contra el único.
INSERT INTO `torneo_categoria` (`torneo_id`, `categoria_juego_id`, `cupo`, `monto_inscripcion_clp`, `semilla_sorteo`)
SELECT t.`id`, cj.`id`, t.`cupo`, 0, t.`semilla_sorteo`
FROM `torneo` t
CROSS JOIN `categoria_juego` cj
WHERE cj.`nombre` = 'Sin categoría'
  AND NOT EXISTS (SELECT 1 FROM `torneo_categoria` tc WHERE tc.`torneo_id` = t.`id`);

-- Las huérfanas, al **único** cuadro de su torneo. El `HAVING COUNT(*) = 1` no es
-- decoración: si un torneo ya tuviera dos cuadros, elegir uno sería inventar a qué
-- categoría se anotó esa persona. Preferimos que quede nula y que el `NOT NULL` de
-- abajo haga fallar la migración a voz en cuello.
UPDATE `inscripcion_torneo` i
JOIN (
  SELECT `torneo_id`, MIN(`id`) AS cuadro_id
  FROM `torneo_categoria` GROUP BY `torneo_id` HAVING COUNT(*) = 1
) u ON u.`torneo_id` = i.`torneo_id`
SET i.`torneo_categoria_id` = u.cuadro_id
WHERE i.`torneo_categoria_id` IS NULL;

UPDATE `partido` p
JOIN (
  SELECT `torneo_id`, MIN(`id`) AS cuadro_id
  FROM `torneo_categoria` GROUP BY `torneo_id` HAVING COUNT(*) = 1
) u ON u.`torneo_id` = p.`torneo_id`
SET p.`torneo_categoria_id` = u.cuadro_id
WHERE p.`torneo_categoria_id` IS NULL;

-- ── 2. La columna pasa a obligatoria ─────────────────────────────────────────
--
-- **Las claves foráneas se sueltan primero, y no es una preferencia de estilo**:
-- MySQL rechaza el `NOT NULL` mientras exista una FK con `ON DELETE SET NULL` sobre
-- esa columna —"Column 'torneo_categoria_id' cannot be NOT NULL: needed in a foreign
-- key constraint ... SET NULL"—. Se vuelven a poner en el paso 3 con `CASCADE`, que
-- es lo único coherente ahora que la columna no admite nulos.
ALTER TABLE `inscripcion_torneo` DROP FOREIGN KEY `inscripcion_torneo_torneo_categoria_id_fkey`;
ALTER TABLE `partido` DROP FOREIGN KEY `partido_torneo_categoria_id_fkey`;

-- Si el paso 1 dejó algo sin rellenar, **esto falla y la migración no se aplica**.
-- Es lo que queremos: mejor una migración que no corre que un historial mutilado.
ALTER TABLE `inscripcion_torneo` MODIFY `torneo_categoria_id` INTEGER NOT NULL;
ALTER TABLE `partido` MODIFY `torneo_categoria_id` INTEGER NOT NULL;

-- ── 3. El único de `Partido` cambia de eje ───────────────────────────────────
--
-- De `(torneo_id, ronda, posicion)` a `(torneo_categoria_id, ronda, posicion)`.
-- **Es el corazón del cambio**: un torneo con cuadros de 4ª y de Honor tiene dos
-- partidos en la ronda 1 posición 1, uno de cada cuadro, y con el único viejo el
-- segundo no se podía guardar.
--
-- La clave foránea se suelta primero porque MySQL no deja tocar el índice que la
-- sostiene, y se vuelve a poner al final con `CASCADE`: ahora que la columna es
-- obligatoria, `SET NULL` ya no es una opción válida.
ALTER TABLE `partido` DROP INDEX `partido_torneo_id_ronda_posicion_key`;
ALTER TABLE `partido` ADD UNIQUE INDEX `partido_torneo_categoria_id_ronda_posicion_key`(`torneo_categoria_id`, `ronda`, `posicion`);
ALTER TABLE `partido` DROP INDEX `partido_torneo_categoria_id_idx`;
ALTER TABLE `partido` ADD CONSTRAINT `partido_torneo_categoria_id_fkey` FOREIGN KEY (`torneo_categoria_id`) REFERENCES `torneo_categoria`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `inscripcion_torneo` ADD CONSTRAINT `inscripcion_torneo_torneo_categoria_id_fkey` FOREIGN KEY (`torneo_categoria_id`) REFERENCES `torneo_categoria`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. Las columnas que quedaron muertas ─────────────────────────────────────
--
-- `cupo` y `semilla_sorteo` viven en `torneo_categoria` desde T61 y ya nadie las lee.
-- Honor cierra con 8 y la 4ª con 32: un cupo único del torneo no describía nada, y
-- una semilla única hacía que rearmar Honor volviera a sortear la 4ª.
ALTER TABLE `torneo` DROP COLUMN `cupo`;
ALTER TABLE `torneo` DROP COLUMN `semilla_sorteo`;
