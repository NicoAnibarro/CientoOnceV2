USE ciento_once_v2;

ALTER TABLE configuraciones_comerciales
  ADD COLUMN IF NOT EXISTS paleta_visual VARCHAR(30) NOT NULL DEFAULT 'verde_crema',
  ADD COLUMN IF NOT EXISTS logo_mime VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS logo_imagen MEDIUMBLOB NULL;
