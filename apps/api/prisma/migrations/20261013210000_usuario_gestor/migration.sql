-- T215: el gestor ve la agenda del día y anota observaciones (SPEC-identidad.md § Tipos de usuario).
ALTER TABLE `usuario` ADD COLUMN `es_gestor` BOOLEAN NOT NULL DEFAULT false;
