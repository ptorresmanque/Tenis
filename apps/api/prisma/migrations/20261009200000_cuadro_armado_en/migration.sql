-- T132. La última vez que se armó cada cuadro. Deshacer no la borra: es lo que permite
-- que el correo de rearmar diga "el cuadro cambió".
ALTER TABLE `torneo_categoria` ADD COLUMN `armado_en` DATETIME(3) NULL;

-- Los que ya están armados toman la fecha de hoy: si se deshacen y se rearman, también
-- avisan que cambiaron.
UPDATE `torneo_categoria` SET `armado_en` = CURRENT_TIMESTAMP(3) WHERE `semilla_sorteo` IS NOT NULL;
