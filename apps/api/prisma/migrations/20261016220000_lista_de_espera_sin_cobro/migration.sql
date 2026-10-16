-- T325 (SPEC-torneos.md § Lista de espera sin cobro, E1): hasta cuándo se le guarda el cupo a
-- quien recibió la oferta de la lista de espera, y el plazo que fija el club, 30 minutos por
-- omisión. Solo agrega: nadie tiene una oferta todavía.
-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `plazo_cupo_lista_espera_min` INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE `inscripcion_torneo` ADD COLUMN `cupo_ofrecido_hasta` DATETIME(3) NULL;
