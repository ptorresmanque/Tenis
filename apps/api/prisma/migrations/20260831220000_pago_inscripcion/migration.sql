-- T66: el pago de la inscripción.
--
-- `INSCRIPCION_TORNEO` es la única extensión que `pagos` recibe: un valor de enum y
-- nada más. Sigue sin saber qué se está pagando —recibe un monto y una referencia
-- opaca—, y esa propiedad es la que hace que el tercer concepto cueste una línea.
ALTER TABLE `transaccion` MODIFY `concepto` ENUM('RESERVA', 'CUOTA', 'INSCRIPCION_TORNEO') NOT NULL;

-- El estado del pago es un eje **aparte** del estado de la inscripción: son dos
-- preguntas distintas —"¿está en el cuadro?" y "¿pagó?"— y mezclarlas obligaría a
-- inventar `INSCRITA_PERO_SIN_PAGAR`.
--
-- `EXENTA` por omisión y no `PENDIENTE`: las inscripciones que ya existen son de
-- cuadros sin monto, y marcarlas pendientes dejaría al club con una bandeja llena de
-- pagos que nadie debe.
ALTER TABLE `inscripcion_torneo`
  ADD COLUMN `estado_pago` ENUM('EXENTA', 'PENDIENTE', 'PAGADA', 'RECHAZADA') NOT NULL DEFAULT 'EXENTA',
  ADD COLUMN `comprobante_ruta` VARCHAR(200) NULL,
  ADD COLUMN `motivo_rechazo` VARCHAR(200) NULL;
