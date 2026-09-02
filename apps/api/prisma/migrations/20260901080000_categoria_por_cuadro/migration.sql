-- T70: la categoría del torneo baja al cuadro.
--
-- Un mismo fin de semana corre la 5ª y el Honor, y con la categoría en `torneo` el
-- campeón de los dos sumaba lo mismo en una tabla que es única y los mezcla. Ahora cada
-- cuadro dice cuánto vale ganarlo.
--
-- **El backfill va antes de la clave foránea y antes del NOT NULL**, como en T61 y T62:
-- así la base valida fila por fila que lo que quedó apunta a una categoría que existe,
-- en vez de confiar en que el UPDATE hizo lo que decía.
ALTER TABLE `torneo_categoria` ADD COLUMN `categoria_id` INTEGER NULL;

-- Cada cuadro hereda la del torneo del que cuelga: es exactamente lo que repartía hasta
-- hoy, así que ninguna tabla ya publicada cambia de números por esta migración.
UPDATE `torneo_categoria` AS tc
  JOIN `torneo` AS t ON t.`id` = tc.`torneo_id`
  SET tc.`categoria_id` = t.`categoria_id`;

-- El índice va **antes** que la clave foránea: MySQL crea uno solo si no encuentra
-- ninguno que sirva, así que creándolo acá la foránea reusa éste y la tabla no queda
-- con dos índices sobre la misma columna, uno de ellos con nombre de constraint.
CREATE INDEX `torneo_categoria_categoria_id_idx` ON `torneo_categoria`(`categoria_id`);

ALTER TABLE `torneo_categoria` ADD CONSTRAINT `torneo_categoria_categoria_id_fkey`
    FOREIGN KEY (`categoria_id`) REFERENCES `categoria_torneo`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `torneo_categoria` MODIFY `categoria_id` INTEGER NOT NULL;

-- Recién ahora se va del torneo: hasta esta línea había de dónde copiarla.
--
-- El índice a borrar es el que MySQL creó **con la clave foránea**, y se llama como
-- ella: soltar la FK no se lo lleva, y la columna no se puede borrar mientras exista.
ALTER TABLE `torneo` DROP FOREIGN KEY `torneo_categoria_id_fkey`;
DROP INDEX `torneo_categoria_id_fkey` ON `torneo`;
ALTER TABLE `torneo` DROP COLUMN `categoria_id`;
