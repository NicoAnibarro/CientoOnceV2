USE ciento_once_v2;

CREATE TABLE IF NOT EXISTS categorias_productos (
  id_categoria INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_categoria_usuario_nombre (id_usuario, nombre),
  INDEX idx_categoria_usuario_activo (id_usuario, activo),
  CONSTRAINT fk_categoria_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

INSERT IGNORE INTO categorias_productos (id_usuario, nombre) SELECT id_usuario, 'Dulce' FROM usuarios;
INSERT IGNORE INTO categorias_productos (id_usuario, nombre) SELECT id_usuario, 'Salado' FROM usuarios;

ALTER TABLE productos MODIFY categoria VARCHAR(80) NOT NULL DEFAULT 'Dulce', MODIFY stock_actual INT NOT NULL DEFAULT 0;
UPDATE productos SET categoria='Dulce' WHERE LOWER(categoria)='dulce';
UPDATE productos SET categoria='Salado' WHERE LOWER(categoria)='salado';

ALTER TABLE pedidos
  ADD COLUMN subtotal DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER fecha_pago,
  ADD COLUMN descuento_tipo ENUM('porcentaje','fijo') NULL AFTER subtotal,
  ADD COLUMN descuento_valor DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER descuento_tipo,
  ADD COLUMN descuento_importe DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER descuento_valor;
UPDATE pedidos SET subtotal=total WHERE subtotal=0;

ALTER TABLE compras
  ADD COLUMN subtotal DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER fecha_compra,
  ADD COLUMN descuento_tipo ENUM('porcentaje','fijo') NULL AFTER subtotal,
  ADD COLUMN descuento_valor DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER descuento_tipo,
  ADD COLUMN descuento_importe DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER descuento_valor;
UPDATE compras SET subtotal=total WHERE subtotal=0;

ALTER TABLE movimientos_stock MODIFY stock_anterior INT NOT NULL, MODIFY stock_nuevo INT NOT NULL;
