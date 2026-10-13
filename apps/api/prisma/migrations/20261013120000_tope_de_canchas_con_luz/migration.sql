-- T203. El tope de canchas con luz encendida: la instalación eléctrica del club se corta
-- con más de dos a la vez. Nace encendido, en 2 desde las 19:00, porque es lo que el club
-- necesita el día en que esto llega a fedal.cl; la fila existente toma esos valores.
ALTER TABLE `configuracion_club`
    ADD COLUMN `tope_canchas_con_luz` INTEGER NULL DEFAULT 2,
    ADD COLUMN `tope_canchas_con_luz_desde` CHAR(5) NOT NULL DEFAULT '19:00';
