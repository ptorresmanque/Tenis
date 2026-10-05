-- T76. Una reserva activa por cancha y por rango, no por hora de inicio.
--
-- Con reservas de 60 y 90 minutos que empiezan cada media hora, dos que se pisan
-- pueden empezar a horas distintas: 08:00–09:30 y 09:00–10:00. El único sobre
-- `(cancha_id, inicio_activo)` las dejaba pasar a las dos. MariaDB (10.5.3+) trae la
-- restricción hecha: un período de aplicación y un único que prohíbe que los
-- períodos de la misma clave se crucen. Probado en T75 (`test/sin-cruce.spike.spec.ts`).
--
-- El truco del NULL se conserva, ahora sobre la cancha: `cancha_activa` vale
-- `cancha_id` mientras la reserva ocupa la hora y NULL cuando no, y dos NULL no
-- chocan. La deriva la base y no la aplicación, por la misma razón que antes: una
-- columna que el código tiene que acordarse de anular al cancelar es una que alguien
-- va a olvidar.
--
-- El período es cerrado abajo y abierto arriba: 08:00–09:00 y 09:00–10:00 conviven.
ALTER TABLE `reserva`
  ADD COLUMN `cancha_activa` INT
  AS (IF(`estado` IN ('PENDIENTE_PAGO', 'CONFIRMADA'), `cancha_id`, NULL)) VIRTUAL;

ALTER TABLE `reserva` ADD PERIOD FOR `periodo` (`inicio`, `fin`);

ALTER TABLE `reserva`
  ADD UNIQUE `reserva_sin_cruce` (`cancha_activa`, `periodo` WITHOUT OVERLAPS);

-- Sale lo anterior. La clave foránea de `cancha_id` no depende de este índice:
-- `reserva_cancha_id_inicio_idx` empieza por la misma columna y le alcanza.
DROP INDEX `reserva_bloque_activo` ON `reserva`;

ALTER TABLE `reserva` DROP COLUMN `inicio_activo`;
