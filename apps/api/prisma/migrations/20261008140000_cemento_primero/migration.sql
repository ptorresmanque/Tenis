-- T94: cemento primero. Es la superficie de las ocho canchas del club, y el orden del
-- enum es el de la lista que ofrece el panel y el del mensaje de la API.
--
-- Reordenar un ENUM en MariaDB conserva el valor de cada fila: ALTER copia la tabla y
-- convierte por el texto, no por la posición. Probado el 2026-10-08 sobre una tabla
-- temporal con las tres superficies y un nulo: ARCILLA siguió siendo ARCILLA, con su
-- índice interno pasado de 1 a 2.

-- AlterTable
ALTER TABLE `cancha` MODIFY `superficie` ENUM('CEMENTO', 'ARCILLA', 'PASTO_SINTETICO') NOT NULL;

-- AlterTable
ALTER TABLE `torneo` MODIFY `superficie` ENUM('CEMENTO', 'ARCILLA', 'PASTO_SINTETICO') NULL;
