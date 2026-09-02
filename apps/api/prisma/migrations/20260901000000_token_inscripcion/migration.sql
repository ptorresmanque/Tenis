-- T66, corregido tras la revisión: la inscripción necesita una llave propia.
--
-- Sin ella el id alcanzaba para subir un comprobante, y los ids son correlativos:
-- cualquiera podía pisar la transferencia de otro y conseguir que el club le rechazara
-- un pago que sí había hecho —y rechazar libera el cupo, así que además quedaba fuera
-- del torneo—. Comprobado con una sonda antes de escribir esto.
--
-- Mismo mecanismo que el token del QR de `Reserva`: 122 bits que no se adivinan.

-- Nulable primero para poder rellenar las que ya existen; el único va al final.
ALTER TABLE `inscripcion_torneo` ADD COLUMN `token` VARCHAR(43) NULL;

UPDATE `inscripcion_torneo` SET `token` = UUID() WHERE `token` IS NULL;

ALTER TABLE `inscripcion_torneo` MODIFY `token` VARCHAR(43) NOT NULL;
CREATE UNIQUE INDEX `inscripcion_torneo_token_key` ON `inscripcion_torneo`(`token`);
