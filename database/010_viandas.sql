USE ciento_once_v2;

ALTER TABLE movimientos_caja
  MODIFY origen ENUM('pedido','compra','manual','vianda') NOT NULL;

CREATE TABLE IF NOT EXISTS tipos_vianda (
  id_tipo_vianda INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  precio_base DECIMAL(12,2) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tipo_vianda_usuario_nombre (id_usuario,nombre),
  INDEX idx_tipo_vianda_usuario_activo (id_usuario,activo),
  CONSTRAINT fk_tipo_vianda_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
  CONSTRAINT chk_tipo_vianda_precio CHECK(precio_base>=0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS configuraciones_viandas (
  id_usuario INT UNSIGNED PRIMARY KEY,
  precio_postre DECIMAL(12,2) NOT NULL DEFAULT 0,
  precio_envio DECIMAL(12,2) NOT NULL DEFAULT 0,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_config_vianda_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
  CONSTRAINT chk_config_vianda_importes CHECK(precio_postre>=0 AND precio_envio>=0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS series_viandas (
  id_serie CHAR(36) PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  frecuencia ENUM('unico','diario','semanal','mensual') NOT NULL DEFAULT 'unico',
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  dias_semana_json JSON NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_serie_vianda_usuario (id_usuario,fecha_inicio,fecha_fin),
  CONSTRAINT fk_serie_vianda_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pedidos_viandas (
  id_pedido_vianda INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  id_serie CHAR(36) NOT NULL,
  id_cliente INT UNSIGNED NOT NULL,
  cliente_nombre VARCHAR(100) NOT NULL,
  cliente_telefono VARCHAR(40) NULL,
  cliente_direccion VARCHAR(255) NULL,
  id_tipo_vianda INT UNSIGNED NOT NULL,
  tipo_nombre VARCHAR(100) NOT NULL,
  cantidad SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
  con_postre TINYINT(1) NOT NULL DEFAULT 0,
  precio_postre_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
  con_envio TINYINT(1) NOT NULL DEFAULT 0,
  costo_envio DECIMAL(12,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento_tipo ENUM('porcentaje','fijo') NULL,
  descuento_valor DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento_importe DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  fecha_entrega DATE NOT NULL,
  hora_entrega TIME NOT NULL,
  estado ENUM('pendiente','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
  pagado TINYINT(1) NOT NULL DEFAULT 0,
  fecha_pago DATETIME NULL,
  metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo',
  observaciones TEXT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vianda_usuario_entrega (id_usuario,fecha_entrega,hora_entrega),
  INDEX idx_vianda_usuario_estado (id_usuario,estado,pagado),
  INDEX idx_vianda_serie (id_serie),
  CONSTRAINT fk_vianda_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
  CONSTRAINT fk_vianda_serie FOREIGN KEY(id_serie) REFERENCES series_viandas(id_serie),
  CONSTRAINT fk_vianda_cliente FOREIGN KEY(id_cliente) REFERENCES clientes(id_cliente),
  CONSTRAINT fk_vianda_tipo FOREIGN KEY(id_tipo_vianda) REFERENCES tipos_vianda(id_tipo_vianda),
  CONSTRAINT chk_vianda_importes CHECK(
    cantidad>0 AND precio_unitario>=0 AND precio_postre_unitario>=0 AND
    costo_envio>=0 AND subtotal>=0 AND descuento_valor>=0 AND
    descuento_importe>=0 AND total>=0
  )
) ENGINE=InnoDB;

INSERT IGNORE INTO configuraciones_viandas(id_usuario)
SELECT id_usuario FROM usuarios;

INSERT IGNORE INTO tipos_vianda(id_usuario,nombre,precio_base)
SELECT id_usuario,'Vianda',0 FROM usuarios;

INSERT IGNORE INTO tipos_vianda(id_usuario,nombre,precio_base)
SELECT id_usuario,'Vianda reforzada',0 FROM usuarios;
