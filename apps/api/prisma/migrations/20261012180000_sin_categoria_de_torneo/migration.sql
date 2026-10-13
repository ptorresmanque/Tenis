-- T199. Se elimina la categoría de torneo ("Club 250", "Máster 500").
--
-- Desde T198 los puntos salen de la tabla del nivel con que el torneo entró a cada tour
-- (SPEC-tours.md), y el ranking ya no la lee. Con una tabla por categoría de juego (D4) la
-- razón por la que T70 la había bajado al cuadro —que el campeón de Honor no sumara lo
-- mismo que el de 5ª en una tabla única— también desapareció.
--
-- No hay torneos reales en producción (D12): los de prueba siguen abriendo, porque solo
-- pierden una columna que ya nadie lee.

-- Primero la clave foránea: la columna no se puede borrar mientras exista. El índice lo
-- creó T70 con su propio nombre antes de la foránea, que lo reusó; borrar la columna se
-- lo lleva.
ALTER TABLE `torneo_categoria` DROP FOREIGN KEY `torneo_categoria_categoria_id_fkey`;
ALTER TABLE `torneo_categoria` DROP COLUMN `categoria_id`;

DROP TABLE `categoria_torneo`;
