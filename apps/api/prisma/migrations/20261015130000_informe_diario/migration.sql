-- T274: el informe de reservas del día por correo (SPEC-revision-qa.md, A9): si sale y a qué
-- hora entera del reloj del club. Por omisión, activo a las 07:00.
-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `informe_diario_activo` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `informe_diario_hora` INTEGER NOT NULL DEFAULT 7;

