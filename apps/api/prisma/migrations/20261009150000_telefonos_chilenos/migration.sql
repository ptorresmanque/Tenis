-- T120. Los teléfonos que ya estaban guardados, a la forma con que se guardan desde ahora:
-- `56` más los 9 dígitos (ver `src/comun/telefono.ts`).
--
-- **Solo lo que se puede leer como chileno.** Con o sin el 56, con espacios, guiones o
-- paréntesis: se dejan los dígitos. Los 8 dígitos de antes, el móvil sin su 9, reciben el
-- 569, como hacía la regla de torneos. **Lo que no calza no se toca**: un número extranjero
-- o uno mal escrito queda como estaba, para no perder el dato; `mostrarTelefono` lo muestra
-- tal cual y el formulario pide uno válido la próxima vez que se edite.
--
-- **`jugador` no está**: su teléfono ya se guarda normalizado desde T64 con una regla que da
-- lo mismo para los números chilenos, y es parte de una llave única. No hay nada que mover y
-- sí algo que romper.
--
-- Ninguna de estas columnas es única, así que normalizar no puede juntar dos filas.

UPDATE `usuario`
SET `telefono` = CASE
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^56[0-9]{9}$' THEN REGEXP_REPLACE(`telefono`, '[^0-9]', '')
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{9}$' THEN CONCAT('56', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{8}$' THEN CONCAT('569', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  ELSE `telefono`
END
WHERE `telefono` IS NOT NULL AND `telefono` <> '';

UPDATE `reserva`
SET `telefono` = CASE
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^56[0-9]{9}$' THEN REGEXP_REPLACE(`telefono`, '[^0-9]', '')
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{9}$' THEN CONCAT('56', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{8}$' THEN CONCAT('569', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  ELSE `telefono`
END
WHERE `telefono` IS NOT NULL AND `telefono` <> '';

UPDATE `solicitud_contacto`
SET `telefono` = CASE
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^56[0-9]{9}$' THEN REGEXP_REPLACE(`telefono`, '[^0-9]', '')
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{9}$' THEN CONCAT('56', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{8}$' THEN CONCAT('569', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  ELSE `telefono`
END
WHERE `telefono` IS NOT NULL AND `telefono` <> '';

UPDATE `profesor`
SET `telefono` = CASE
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^56[0-9]{9}$' THEN REGEXP_REPLACE(`telefono`, '[^0-9]', '')
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{9}$' THEN CONCAT('56', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{8}$' THEN CONCAT('569', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  ELSE `telefono`
END
WHERE `telefono` IS NOT NULL AND `telefono` <> '';

UPDATE `inscripcion_clase`
SET `telefono` = CASE
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^56[0-9]{9}$' THEN REGEXP_REPLACE(`telefono`, '[^0-9]', '')
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{9}$' THEN CONCAT('56', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{8}$' THEN CONCAT('569', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  ELSE `telefono`
END
WHERE `telefono` IS NOT NULL AND `telefono` <> '';

UPDATE `configuracion_club`
SET `telefono` = CASE
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^56[0-9]{9}$' THEN REGEXP_REPLACE(`telefono`, '[^0-9]', '')
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{9}$' THEN CONCAT('56', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  WHEN REGEXP_REPLACE(`telefono`, '[^0-9]', '') REGEXP '^[0-9]{8}$' THEN CONCAT('569', REGEXP_REPLACE(`telefono`, '[^0-9]', ''))
  ELSE `telefono`
END
WHERE `telefono` IS NOT NULL AND `telefono` <> '';
