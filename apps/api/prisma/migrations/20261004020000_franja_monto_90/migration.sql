-- T79. El precio de 1 hora y media de cada franja.
--
-- Nulable a propósito: nulo significa que esa duración no se vende a no-socios en esa
-- franja. Todas las franjas existentes quedan así hasta que el admin escriba el monto,
-- y mientras tanto el no-socio ve exactamente lo de antes: solo 1 hora.
ALTER TABLE `franja_horaria` ADD COLUMN `monto_clp_90` INTEGER NULL;
