-- ─────────────────────────────────────────────────────────────────────────────
-- La llave del jugador deja de ser el teléfono solo y pasa a ser
-- (telefono, nombre, apellido).
--
-- **Lo destapó el club usando el formulario**: el padre que inscribe a sus hijos
-- escribe su propio teléfono en las tres fichas, y con el teléfono de llave los tres
-- menores eran una sola persona —el segundo hijo recibía un "ya estás inscrito" que
-- nadie entendía, porque la pantalla no decía cuál era el campo que los confundía—.
--
-- La dirección del cambio es de más estricto a menos: todo lo que hoy cumple el único
-- de una columna cumple el de tres, así que **esta migración no puede chocar** y no
-- necesita limpiar nada antes. El sentido contrario —el de T64— sí lo necesitó.
--
-- Lo que sí se pierde: los teléfonos que T64 anuló para poder crear el único de una
-- columna no vuelven. Se anotó ahí como pérdida conocida y se corrige desde el panel,
-- ficha por ficha, que es donde alguien puede mirar si son la misma persona.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX `jugador_telefono_key` ON `jugador`;

-- La collation de la tabla es `utf8mb4_unicode_ci`, así que "Juan Pérez" y "juan
-- perez" chocan y quedan como un solo jugador. Es deliberado: la diferencia entre dos
-- personas no puede ser una tilde.
CREATE UNIQUE INDEX `jugador_telefono_nombre_apellido_key`
  ON `jugador`(`telefono`, `nombre`, `apellido`);
