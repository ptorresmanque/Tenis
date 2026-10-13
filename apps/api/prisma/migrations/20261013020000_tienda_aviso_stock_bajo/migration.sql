-- T173: el aviso de stock bajo sale una vez por cada bajada del umbral.
ALTER TABLE `variante` ADD COLUMN `aviso_stock_bajo_en` DATETIME(3) NULL;
