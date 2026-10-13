-- T212. Qué duraciones toma el socio en horario prime: 1 hora, 1 hora y media o las dos.
-- Nace en solo 1 hora, que es lo que el club pide hoy. Las reservas ya tomadas no se tocan.
ALTER TABLE `configuracion_club`
    ADD COLUMN `duraciones_socio_pico` ENUM('UNA_HORA', 'HORA_Y_MEDIA', 'AMBAS') NOT NULL DEFAULT 'UNA_HORA';
