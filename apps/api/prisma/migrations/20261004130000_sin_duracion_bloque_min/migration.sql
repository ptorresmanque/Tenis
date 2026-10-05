-- T92. La duración la elige quien reserva desde T78: esta columna no la lee nadie, y el
-- panel la seguía ofreciendo como si mandara sobre la grilla.
ALTER TABLE `configuracion_club` DROP COLUMN `duracion_bloque_min`;
