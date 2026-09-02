-- T67: los partidos se programan en cancha y horario.
--
-- Sale de Out of scope, donde estaba con nombre propio —"es un módulo propio, no un
-- campo en `Partido`"—, y entra acotado gracias a un atajo: **programar crea un
-- `Bloqueo` con motivo TORNEO**, la misma máquina que `clases` ya usa. Por eso esto no
-- toca `reservas`: la disponibilidad ya respeta los bloqueos.
ALTER TABLE `partido`
  ADD COLUMN `programado_inicio` DATETIME(3) NULL,
  ADD COLUMN `programado_fin` DATETIME(3) NULL,
  ADD COLUMN `bloqueo_id` INTEGER NULL;

CREATE INDEX `partido_programado_inicio_idx` ON `partido`(`programado_inicio`);
CREATE UNIQUE INDEX `partido_bloqueo_id_key` ON `partido`(`bloqueo_id`);

-- `SET NULL` y no `CASCADE`: si el club borra el bloqueo a mano, el partido no
-- desaparece — pierde su hora, que es lo que pasó de verdad.
ALTER TABLE `partido` ADD CONSTRAINT `partido_bloqueo_id_fkey` FOREIGN KEY (`bloqueo_id`) REFERENCES `bloqueo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
