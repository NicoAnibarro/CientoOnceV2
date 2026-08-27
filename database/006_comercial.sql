USE ciento_once_v2;

ALTER TABLE productos ADD COLUMN stock_minimo INT NOT NULL DEFAULT 5 AFTER stock_actual;
ALTER TABLE pedidos ADD COLUMN metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo' AFTER pagado;
ALTER TABLE pedidos ADD COLUMN pago_detalle_json JSON NULL AFTER metodo_pago;
ALTER TABLE compras ADD COLUMN metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo' AFTER total;
ALTER TABLE movimientos_caja ADD COLUMN metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo' AFTER monto;

CREATE TABLE cierres_caja (
  id_cierre_caja INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  fecha_cierre DATE NOT NULL,
  efectivo_esperado DECIMAL(12,2) NOT NULL DEFAULT 0,
  efectivo_contado DECIMAL(12,2) NOT NULL DEFAULT 0,
  diferencia DECIMAL(12,2) NOT NULL DEFAULT 0,
  resumen_json JSON NULL,
  observaciones VARCHAR(500),
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cierre_usuario_fecha (id_usuario,fecha_cierre),
  CONSTRAINT fk_cierre_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE empleados (
  id_empleado INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  rol ENUM('administrador','caja','ventas','reparto') NOT NULL DEFAULT 'ventas',
  permisos_json JSON NULL,
  pin_hash VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_empleado_usuario (id_usuario,activo),
  CONSTRAINT fk_empleado_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE configuraciones_comerciales (
  id_usuario INT UNSIGNED PRIMARY KEY,
  nombre_negocio VARCHAR(150),
  telefono VARCHAR(50),
  direccion VARCHAR(255),
  cuit VARCHAR(20),
  mercado_pago_activo TINYINT(1) NOT NULL DEFAULT 0,
  arca_activo TINYINT(1) NOT NULL DEFAULT 0,
  arca_ambiente ENUM('homologacion','produccion') NOT NULL DEFAULT 'homologacion',
  arca_punto_venta INT NULL,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_config_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE pagos_integracion (
  id_pago_integracion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  proveedor VARCHAR(30) NOT NULL,
  proveedor_pago_id VARCHAR(120) NOT NULL,
  id_pedido INT UNSIGNED NULL,
  estado VARCHAR(40) NOT NULL,
  monto DECIMAL(12,2) NOT NULL DEFAULT 0,
  payload_json JSON NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pago_proveedor (proveedor,proveedor_pago_id),
  INDEX idx_pago_usuario_pedido (id_usuario,id_pedido),
  CONSTRAINT fk_pago_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;
