-- T142. Los textos de la página "El club", editables desde el panel. Por omisión, los
-- que la página tenía escritos: aplicar la migración no cambia lo que se ve.
ALTER TABLE `configuracion_club`
    ADD COLUMN `el_club_titulo` VARCHAR(80) NOT NULL DEFAULT 'FEDAL Tennis Center',
    ADD COLUMN `el_club_bajada` VARCHAR(300) NOT NULL DEFAULT 'Un club de barrio con canchas de torneo. Desde 2008, abierto a socios y a quien quiera venir a jugar una hora.',
    ADD COLUMN `el_club_canchas` VARCHAR(600) NOT NULL DEFAULT 'Todas de superficie dura y velocidad media, como el Australian Open. Las dos centrales se llaman Basilea y Manacor, y el club no da más explicaciones.';
