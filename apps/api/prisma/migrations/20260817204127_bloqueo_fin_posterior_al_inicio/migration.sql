-- Un bloqueo con `fin` anterior o igual a `inicio` no bloquea nada y no avisa: la
-- cancha sigue apareciendo libre y nadie entiende por qué la mantención "no tomó".
--
-- Escrito a mano porque Prisma no modela CHECK constraints, igual que el de fila
-- única de `configuracion_club`. La validación del panel ataja el caso normal;
-- esto ataja al que escribe SQL directo.
ALTER TABLE `bloqueo`
  ADD CONSTRAINT `bloqueo_fin_posterior_al_inicio` CHECK (`fin` > `inicio`);
