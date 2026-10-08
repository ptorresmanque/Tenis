-- T98: una tarifa general puede valer solo para las canchas techadas o solo para las
-- abiertas. Nulo = toda cancha, que es lo que eran todas las franjas hasta hoy: la
-- columna nace nula y ninguna tarifa existente cambia de precio.

-- AlterTable
ALTER TABLE `franja_horaria` ADD COLUMN `techada` BOOLEAN NULL;
