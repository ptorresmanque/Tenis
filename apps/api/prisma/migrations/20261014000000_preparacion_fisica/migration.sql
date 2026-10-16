-- T231: clases de preparación física, en el gimnasio (SPEC-clases.md § Series con un horario
-- por día y clases en el gimnasio). Van sin cancha y sin nivel; las que ya existen quedan
-- como tenis. La serie suma su tipo, y el club configura el cupo de una clase grupal.
-- AlterTable
ALTER TABLE `clase` ADD COLUMN `tipo` ENUM('TENIS', 'PREPARACION_FISICA') NOT NULL DEFAULT 'TENIS',
    MODIFY `cancha_id` INTEGER NULL,
    MODIFY `nivel` ENUM('INICIACION', 'INTERMEDIO', 'COMPETITIVO', 'NINOS') NULL;

-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `gimnasio_cupo_grupal` INTEGER NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE `serie_de_clases` ADD COLUMN `tipo` ENUM('TENIS', 'PREPARACION_FISICA') NOT NULL DEFAULT 'TENIS',
    MODIFY `nivel` ENUM('INICIACION', 'INTERMEDIO', 'COMPETITIVO', 'NINOS') NULL;

