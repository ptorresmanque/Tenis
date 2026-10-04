-- Revisión de T89. El destino de un cambio queda atado al pago que lo paga.
--
-- Dos pedidos a la vez desde el mismo enlace pasan los dos el chequeo de "pago en curso"
-- antes de que exista alguna transacción, y el último en escribir dejaba su destino. La
-- vuelta de Webpay solo mueve la reserva si el pago que vuelve es este.
ALTER TABLE `reserva` ADD COLUMN `cambio_transaccion_id` INTEGER NULL;
