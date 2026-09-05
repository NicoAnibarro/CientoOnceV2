USE ciento_once_v2;

ALTER TABLE configuraciones_comerciales
  ADD COLUMN IF NOT EXISTS paleta_app VARCHAR(30) NOT NULL DEFAULT 'verde' AFTER paleta_visual;
