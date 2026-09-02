-- ─────────────────────────────────────────────────────────────────────────────
-- El medio de pago admite el efectivo.
--
-- Lo pidió el club al usar el panel: el que llega al mesón, se anota y paga ahí no
-- tenía cómo quedar registrado. Su inscripción nacía pendiente y **no había ninguna
-- forma de decir cómo se pagó** ni de marcarla pagada desde la lista de inscritos.
--
-- Solo lo pone el admin al confirmar el pago: el formulario público no cobra en
-- efectivo, así que nadie puede elegirlo desde la calle.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `inscripcion_torneo`
  MODIFY COLUMN `medio_pago` ENUM('WEBPAY', 'TRANSFERENCIA', 'EFECTIVO') NULL;
