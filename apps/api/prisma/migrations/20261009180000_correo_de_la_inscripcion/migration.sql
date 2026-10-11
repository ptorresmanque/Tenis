-- T127. A dónde se le escribe a quien se inscribe a un torneo.
--
-- Nulo: las inscripciones de antes no lo tienen, y el admin puede anotar a alguien sin
-- correo. La inscripción pública lo exige en `inscripcion-publica.dto.ts`.
ALTER TABLE `inscripcion_torneo` ADD COLUMN `email` VARCHAR(191) NULL;
