-- T89. El destino de un cambio que espera el pago de la diferencia.
--
-- La reserva no se mueve hasta que Webpay autoriza: mientras tanto sigue CONFIRMADA en
-- su hora, y el destino espera acá. Nulables y sin llave foránea: fuera de la vuelta
-- de Webpay son inertes, y "hay un cambio en curso" lo dice la transacción PENDIENTE.
ALTER TABLE `reserva` ADD COLUMN `cambio_cancha_id` INTEGER NULL,
    ADD COLUMN `cambio_es_pico` BOOLEAN NULL,
    ADD COLUMN `cambio_fin` DATETIME(3) NULL,
    ADD COLUMN `cambio_inicio` DATETIME(3) NULL;
