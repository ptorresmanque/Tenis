-- T184. La tienda y la cafetería del club, como información: descripción, horario y
-- WhatsApp de cada una. Vacías por omisión: el sitio no las muestra hasta que el club
-- escriba, así que aplicar la migración no cambia lo que se ve.
ALTER TABLE `configuracion_club`
    ADD COLUMN `tienda_descripcion` VARCHAR(600) NOT NULL DEFAULT '',
    ADD COLUMN `tienda_horario` VARCHAR(120) NOT NULL DEFAULT '',
    ADD COLUMN `tienda_whatsapp` VARCHAR(40) NOT NULL DEFAULT '',
    ADD COLUMN `cafeteria_descripcion` VARCHAR(600) NOT NULL DEFAULT '',
    ADD COLUMN `cafeteria_horario` VARCHAR(120) NOT NULL DEFAULT '',
    ADD COLUMN `cafeteria_whatsapp` VARCHAR(40) NOT NULL DEFAULT '';
