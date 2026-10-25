USE ciento_once_v2;

ALTER TABLE series_viandas
  ADD COLUMN id_cliente INT UNSIGNED NULL AFTER id_usuario,
  ADD COLUMN cliente_nombre VARCHAR(100) NULL AFTER id_cliente,
  ADD COLUMN cliente_telefono VARCHAR(40) NULL AFTER cliente_nombre,
  ADD COLUMN cliente_direccion VARCHAR(255) NULL AFTER cliente_telefono,
  ADD COLUMN metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo' AFTER dias_semana_json,
  ADD COLUMN total_plan DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER metodo_pago,
  ADD COLUMN monto_pagado DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER total_plan,
  ADD COLUMN pagado TINYINT(1) NOT NULL DEFAULT 0 AFTER monto_pagado,
  ADD COLUMN observaciones TEXT NULL AFTER pagado,
  ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1 AFTER observaciones,
  ADD INDEX idx_serie_vianda_cliente (id_usuario,id_cliente,activo),
  ADD CONSTRAINT fk_serie_vianda_cliente FOREIGN KEY(id_cliente) REFERENCES clientes(id_cliente),
  ADD CONSTRAINT chk_serie_vianda_importes CHECK(total_plan>=0 AND monto_pagado>=0);

CREATE TABLE IF NOT EXISTS pedido_vianda_detalles (
  id_pedido_vianda_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  id_pedido_vianda INT UNSIGNED NOT NULL,
  id_tipo_vianda INT UNSIGNED NOT NULL,
  tipo_nombre VARCHAR(100) NOT NULL,
  cantidad SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
  con_postre TINYINT(1) NOT NULL DEFAULT 0,
  precio_postre_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pvd_usuario_pedido (id_usuario,id_pedido_vianda),
  INDEX idx_pvd_tipo (id_tipo_vianda),
  CONSTRAINT fk_pvd_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
  CONSTRAINT fk_pvd_pedido FOREIGN KEY(id_pedido_vianda) REFERENCES pedidos_viandas(id_pedido_vianda),
  CONSTRAINT fk_pvd_tipo FOREIGN KEY(id_tipo_vianda) REFERENCES tipos_vianda(id_tipo_vianda),
  CONSTRAINT chk_pvd_importes CHECK(cantidad>0 AND precio_unitario>=0 AND precio_postre_unitario>=0 AND subtotal>=0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pagos_viandas (
  id_pago_vianda INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  id_serie CHAR(36) NOT NULL,
  id_pedido_vianda INT UNSIGNED NULL,
  monto DECIMAL(12,2) NOT NULL,
  metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo',
  fecha_pago DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pago_vianda_usuario_serie (id_usuario,id_serie,activo),
  INDEX idx_pago_vianda_fecha (id_usuario,fecha_pago),
  UNIQUE KEY uq_pago_vianda_entrega (id_usuario,id_pedido_vianda),
  CONSTRAINT fk_pago_vianda_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
  CONSTRAINT fk_pago_vianda_serie FOREIGN KEY(id_serie) REFERENCES series_viandas(id_serie),
  CONSTRAINT fk_pago_vianda_pedido FOREIGN KEY(id_pedido_vianda) REFERENCES pedidos_viandas(id_pedido_vianda),
  CONSTRAINT chk_pago_vianda_monto CHECK(monto>0)
) ENGINE=InnoDB;

