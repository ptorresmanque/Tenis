-- T100: dónde está el club, para el mapa de "El club" y el "Cómo llegar" de los correos.
-- Nacen nulas: sin ubicación cargada, el sitio no muestra mapa.

-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `latitud` DOUBLE NULL,
    ADD COLUMN `longitud` DOUBLE NULL;
