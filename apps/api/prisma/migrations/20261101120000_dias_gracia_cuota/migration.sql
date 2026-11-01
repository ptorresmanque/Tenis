-- T379 (SPEC-cuotas.md § Días de gracia): cuántos días sigue reservando el socio con la
-- mensualidad vencida, 5 por omisión. Solo agrega: con el valor por omisión, la gracia rige
-- desde que se aplica, sin tocar ninguna fila.
-- AlterTable
ALTER TABLE `configuracion_club` ADD COLUMN `dias_gracia_cuota` INTEGER NOT NULL DEFAULT 5;
