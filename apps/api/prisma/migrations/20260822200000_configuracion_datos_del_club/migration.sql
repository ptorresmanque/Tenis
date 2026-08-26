-- Los datos del club, que hasta ahora vivían escritos en las plantillas del front.
--
-- Con DEFAULT y NOT NULL: la fila de configuración ya existe —es una sola y la base
-- lo impone con un CHECK—, así que sin default el ALTER dejaría valores nulos en una
-- columna que el resto del código va a leer siempre.
ALTER TABLE `configuracion_club`
  ADD COLUMN `nombre` VARCHAR(120) NOT NULL DEFAULT 'FEDAL Tennis Center',
  ADD COLUMN `direccion` VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN `telefono` VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN `email` VARCHAR(120) NOT NULL DEFAULT '';
