USE ciento_once_v2;
ALTER TABLE clientes
 ADD COLUMN latitud DECIMAL(10,7) NULL AFTER direccion,
 ADD COLUMN longitud DECIMAL(10,7) NULL AFTER latitud,
 ADD COLUMN google_place_id VARCHAR(255) NULL AFTER longitud,
 ADD COLUMN ubicacion_origen ENUM('manual','busqueda','mapa','actual') NULL AFTER google_place_id,
 ADD COLUMN instrucciones_entrega VARCHAR(255) NULL AFTER ubicacion_origen;
CREATE INDEX idx_clientes_coordenadas ON clientes (id_usuario, latitud, longitud);
