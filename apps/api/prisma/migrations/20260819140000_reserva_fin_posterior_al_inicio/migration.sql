-- Una reserva que termina antes de empezar no significa nada, y todo lo que la lee
-- —la grilla, el panel del admin, el cupo semanal— asume lo contrario.
--
-- Escrito a mano porque Prisma no modela CHECK constraints, igual que el de bloqueo
-- en T14 y el de fila única en T9. Acá sí se puede: ni `inicio` ni `fin` tienen
-- foreign key, que es lo que impide el CHECK de acompanante_reserva.
--
-- El DTO de T22 lo va a atajar antes con un mensaje entendible; esto ataja a quien
-- escriba SQL directo.
ALTER TABLE `reserva`
  ADD CONSTRAINT `reserva_fin_posterior_al_inicio` CHECK (`fin` > `inicio`);
