USE ciento_once_v2;

ALTER TABLE configuraciones_comerciales
  ADD COLUMN paleta_visual VARCHAR(30) NOT NULL DEFAULT 'verde_crema',
  ADD COLUMN logo_mime VARCHAR(40) NULL,
  ADD COLUMN logo_imagen MEDIUMBLOB NULL;
