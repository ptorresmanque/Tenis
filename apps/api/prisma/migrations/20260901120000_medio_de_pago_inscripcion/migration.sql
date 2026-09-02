-- ─────────────────────────────────────────────────────────────────────────────
-- La inscripción anota **cómo dijo que iba a pagar**.
--
-- Lo pide el arreglo del cupo que nadie soltaba: quien elige Webpay y cierra la
-- ventana de pago no deja rastro —la pasarela no avisa cuando alguien cierra una
-- pestaña—, así que su inscripción se quedaba viva y ocupando lugar para siempre.
--
-- Sin esta columna, esa inscripción es indistinguible de la que el admin anota a mano
-- para alguien que va a pagar en efectivo en el mesón: las dos son `PENDIENTE`, sin
-- comprobante y sin transacción. Con ella, el barrido borra solo las `WEBPAY` y no
-- toca nunca las que anotó el club.
--
-- Nula en todo lo que ya existe, que es lo correcto: son inscripciones que el admin
-- resuelve a mano, y ninguna se creó eligiendo un medio de pago.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `inscripcion_torneo`
  ADD COLUMN `medio_pago` ENUM('WEBPAY', 'TRANSFERENCIA') NULL;
