-- La llave de la página pública de la reserva, la que abre el QR de portería.
--
-- En tres pasos y no en uno: la columna es única y obligatoria, así que agregarla
-- así de entrada fallaría con las reservas que ya existen —todas quedarían con el
-- mismo valor vacío y chocarían entre sí en el índice—.

-- 1. Nace opcional, para que las filas existentes pasen.
ALTER TABLE `reserva` ADD COLUMN `token` VARCHAR(43) NULL;

-- 2. A cada reserva vieja se le da uno. UUID() es distinto en cada fila —a
--    diferencia de RAND() en algunos motores, que se evalúa una sola vez— y sin
--    guiones queda del largo que usa la aplicación.
UPDATE `reserva` SET `token` = REPLACE(UUID(), '-', '') WHERE `token` IS NULL;

-- 3. Recién ahora se exige, con su índice único.
ALTER TABLE `reserva` MODIFY COLUMN `token` VARCHAR(43) NOT NULL;
CREATE UNIQUE INDEX `reserva_token_key` ON `reserva`(`token`);
