-- Las notas de la clase y de la serie llegan a 500 caracteres, el tope que ya valida
-- `leerClaseNueva`. Con VARCHAR(191), unas notas de 192 a 500 pasaban la validación y
-- reventaban al guardarse (P2000) con un 500.
--
-- Ampliar un VARCHAR no toca lo guardado: todo lo que cabía en 191 cabe en 500.

-- AlterTable
ALTER TABLE `clase` MODIFY `notas` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `serie_de_clases` MODIFY `notas` VARCHAR(500) NULL;
