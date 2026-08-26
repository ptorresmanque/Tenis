-- La ficha del profesor: cómo se anuncia, por qué teléfono lo llaman y qué enseña.
--
-- Las tres columnas nuevas son obligatorias y la tabla ya tiene filas, así que entran
-- con un default vacío, se rellenan desde la cuenta que ya está enganchada, y recién
-- ahí pierden el default. Sin ese paso intermedio la migración no corre, y con el
-- default permanente el club podría guardar un profesor sin nombre.

-- AlterTable
ALTER TABLE `profesor` ADD COLUMN `especialidad` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `nombre_visible` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `tarifa_hora_clp` INTEGER NULL,
    ADD COLUMN `telefono` VARCHAR(191) NOT NULL DEFAULT '',
    MODIFY `usuario_id` INTEGER NULL;

-- Lo que ya se sabía de cada profesor estaba en su cuenta. La especialidad no la sabe
-- nadie: queda visible como pendiente en vez de inventada.
UPDATE `profesor` `p`
  JOIN `usuario` `u` ON `u`.`id` = `p`.`usuario_id`
   SET `p`.`nombre_visible` = CONCAT(`u`.`nombre`, ' ', `u`.`apellido`),
       `p`.`telefono` = COALESCE(`u`.`telefono`, ''),
       `p`.`especialidad` = 'Por definir'
 WHERE `p`.`nombre_visible` = '';

ALTER TABLE `profesor` ALTER COLUMN `especialidad` DROP DEFAULT,
    ALTER COLUMN `nombre_visible` DROP DEFAULT,
    ALTER COLUMN `telefono` DROP DEFAULT;
