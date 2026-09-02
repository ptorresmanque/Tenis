-- ─────────────────────────────────────────────────────────────────────────────
-- T64: el teléfono pasa a ser la llave de identidad del jugador.
--
-- Escrita a mano: **antes de poder hacerlo único hay que normalizar lo que ya está
-- guardado y resolver los choques que aparezcan al normalizar.** En la base de
-- desarrollo, cuatro jugadores con teléfono producían un duplicado; con el índice
-- puesto primero, esta migración no se aplica.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `jugador` ADD COLUMN `procedencia` VARCHAR(120) NULL;

-- ── 1. Solo dígitos ──────────────────────────────────────────────────────────
UPDATE `jugador` SET `telefono` = REGEXP_REPLACE(`telefono`, '[^0-9]', '')
WHERE `telefono` IS NOT NULL;

-- ── 2. La forma canónica, la misma que aplica `telefono.ts` ──────────────────
--
-- Nueve dígitos es el móvil chileno completo y ocho es el móvil sin su 9, como
-- todavía lo dicta media generación. Los demás largos se dejan intactos: o son fijos
-- con área, o son de otro país, y ponerle 56 a un número argentino lo convertiría en
-- otro número al que el club terminaría llamando.
UPDATE `jugador` SET `telefono` = CONCAT('56', `telefono`)
WHERE `telefono` IS NOT NULL AND CHAR_LENGTH(`telefono`) = 9;

UPDATE `jugador` SET `telefono` = CONCAT('569', `telefono`)
WHERE `telefono` IS NOT NULL AND CHAR_LENGTH(`telefono`) = 8;

-- Lo que no alcanza a ser un número deja de fingir que lo es.
UPDATE `jugador` SET `telefono` = NULL
WHERE `telefono` IS NOT NULL
  AND (CHAR_LENGTH(`telefono`) < 8 OR CHAR_LENGTH(`telefono`) > 15);

-- ── 3. Los choques que destapa la normalización ──────────────────────────────
--
-- Dos jugadores con el mismo número casi siempre **son la misma persona anotada dos
-- veces**, que es justo el problema que esta llave viene a resolver. No se fusionan
-- acá: fusionar mueve puntos e historial y eso lo decide el club, no una migración
-- (`SPEC-torneos.md` § No se fusiona automáticamente).
--
-- El teléfono se queda con el **id más bajo** —el jugador más antiguo, el que tiene
-- más historial colgando— y los demás quedan sin teléfono. **Es una pérdida real y
-- visible**: el admin ve una ficha sin número y la corrige, que es preferible a que la
-- migración falle o a fusionar a dos personas por su cuenta.
UPDATE `jugador` j
JOIN (
  SELECT `telefono`, MIN(`id`) AS primero
  FROM `jugador`
  WHERE `telefono` IS NOT NULL
  GROUP BY `telefono`
  HAVING COUNT(*) > 1
) d ON d.`telefono` = j.`telefono` AND j.`id` <> d.primero
SET j.`telefono` = NULL;

-- ── 4. Ahora sí ──────────────────────────────────────────────────────────────
ALTER TABLE `jugador` MODIFY `telefono` VARCHAR(20) NULL;
CREATE UNIQUE INDEX `jugador_telefono_key` ON `jugador`(`telefono`);
