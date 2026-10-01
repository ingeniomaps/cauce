-- Migración de la 3.4.0. Corre antes del deploy, en la misma ventana.
ALTER TABLE orders ADD COLUMN address_street      text NULL;
ALTER TABLE orders ADD COLUMN address_number      text NULL;
ALTER TABLE orders ADD COLUMN address_city        text NULL;
ALTER TABLE orders ADD COLUMN address_postal_code text NULL;

-- `address_line` deja de ser obligatoria: con el flag prendido no se escribe.
ALTER TABLE orders ALTER COLUMN address_line DROP NOT NULL;
