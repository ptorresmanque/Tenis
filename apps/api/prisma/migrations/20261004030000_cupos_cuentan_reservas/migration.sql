-- T84. Los cupos del socio cuentan reservas, no horas.
--
-- El código ya contaba reservas con `count`; lo que mentía era el nombre. Con la hora y
-- media, "1 hora por día" dejaría sin poder reservarla nunca.
--
-- Escrita a mano: lo que genera Prisma al cambiar un `@map` es DROP + ADD, y eso pierde
-- los cupos que el club ya configuró. RENAME COLUMN los conserva.
ALTER TABLE `configuracion_club`
    RENAME COLUMN `cupo_diario_socio_horas` TO `cupo_diario_socio_reservas`,
    RENAME COLUMN `cupo_pico_semanal_horas` TO `cupo_pico_semanal_reservas`;
