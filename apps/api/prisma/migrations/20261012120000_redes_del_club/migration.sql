-- T140. Las redes sociales del club. Vacías por omisión: el sitio no muestra una red que
-- el club no cargó.
ALTER TABLE `configuracion_club`
    ADD COLUMN `instagram` VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN `facebook` VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN `tiktok` VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN `youtube` VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN `whatsapp` VARCHAR(40) NOT NULL DEFAULT '';
