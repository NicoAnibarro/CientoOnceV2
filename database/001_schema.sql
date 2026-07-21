CREATE DATABASE IF NOT EXISTS ciento_once_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ciento_once_v2;

CREATE TABLE usuarios (
 id_usuario INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
 email VARCHAR(150) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE clientes (
 id_cliente INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, nombre VARCHAR(100) NOT NULL,
 telefono VARCHAR(40), direccion VARCHAR(255), observacion TEXT, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_clientes_usuario_nombre (id_usuario,nombre), INDEX idx_clientes_activo (activo),
 CONSTRAINT fk_clientes_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE productos (
 id_producto INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, nombre VARCHAR(120) NOT NULL,
 descripcion TEXT, categoria ENUM('dulce','salado') NOT NULL, costo_estimado DECIMAL(12,2) NOT NULL DEFAULT 0,
 precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0, stock_actual INT UNSIGNED NOT NULL DEFAULT 0, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_productos_usuario_nombre (id_usuario,nombre), INDEX idx_productos_categoria (categoria), INDEX idx_productos_activo (activo),
 CONSTRAINT fk_productos_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT chk_producto_importes CHECK(costo_estimado>=0 AND precio_venta>=0)
) ENGINE=InnoDB;

CREATE TABLE insumos (
 id_insumo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, nombre VARCHAR(120) NOT NULL,
 descripcion TEXT, precio_referencia DECIMAL(12,2) NOT NULL, cantidad_referencia DECIMAL(12,3) NOT NULL,
 unidad_referencia ENUM('g','kg','ml','l','unidad') NOT NULL, tipo_medida ENUM('peso','volumen','unidad') NOT NULL,
 fecha_precio DATE NOT NULL, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_insumos_usuario_nombre(id_usuario,nombre), INDEX idx_insumos_activo(activo),
 CONSTRAINT fk_insumos_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT chk_insumo_valores CHECK(precio_referencia>=0 AND cantidad_referencia>0)
) ENGINE=InnoDB;

CREATE TABLE pedidos (
 id_pedido INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, id_cliente INT UNSIGNED NOT NULL,
 cliente_nombre VARCHAR(100) NOT NULL, cliente_telefono VARCHAR(40), cliente_direccion VARCHAR(255),
 fecha_pedido DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_entrega DATE NOT NULL,
 estado ENUM('pendiente','entregado','cancelado') NOT NULL DEFAULT 'pendiente', pagado TINYINT(1) NOT NULL DEFAULT 0,
 fecha_pago DATETIME NULL, total DECIMAL(12,2) NOT NULL, observaciones TEXT, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_pedidos_usuario(id_usuario), INDEX idx_pedidos_entrega(fecha_entrega), INDEX idx_pedidos_estado(estado), INDEX idx_pedidos_activo(activo),
 CONSTRAINT fk_pedidos_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT fk_pedidos_cliente FOREIGN KEY(id_cliente) REFERENCES clientes(id_cliente)
) ENGINE=InnoDB;

CREATE TABLE pedido_detalles (
 id_pedido_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, id_pedido INT UNSIGNED NOT NULL,
 id_producto INT UNSIGNED NOT NULL, producto_nombre VARCHAR(120) NOT NULL, precio_unitario DECIMAL(12,2) NOT NULL,
 cantidad INT UNSIGNED NOT NULL, subtotal DECIMAL(12,2) NOT NULL, cantidad_stock_descontada INT UNSIGNED NOT NULL DEFAULT 0,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_pd_usuario(id_usuario), INDEX idx_pd_pedido(id_pedido),
 CONSTRAINT fk_pd_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT fk_pd_pedido FOREIGN KEY(id_pedido) REFERENCES pedidos(id_pedido),
 CONSTRAINT fk_pd_producto FOREIGN KEY(id_producto) REFERENCES productos(id_producto)
) ENGINE=InnoDB;

CREATE TABLE compras (
 id_compra INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, proveedor VARCHAR(150) NOT NULL,
 fecha_compra DATE NOT NULL, total DECIMAL(12,2) NOT NULL, observaciones TEXT, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_compras_usuario(id_usuario), INDEX idx_compras_fecha(fecha_compra), INDEX idx_compras_activo(activo),
 CONSTRAINT fk_compras_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE compra_detalles (
 id_compra_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, id_compra INT UNSIGNED NOT NULL,
 id_insumo INT UNSIGNED NOT NULL, insumo_nombre VARCHAR(120) NOT NULL, cantidad DECIMAL(12,3) NOT NULL,
 precio_unitario DECIMAL(12,2) NOT NULL, subtotal DECIMAL(12,2) NOT NULL, INDEX idx_cd_usuario(id_usuario),
 CONSTRAINT fk_cd_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT fk_cd_compra FOREIGN KEY(id_compra) REFERENCES compras(id_compra),
 CONSTRAINT fk_cd_insumo FOREIGN KEY(id_insumo) REFERENCES insumos(id_insumo)
) ENGINE=InnoDB;

CREATE TABLE movimientos_caja (
 id_movimiento_caja INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL,
 tipo ENUM('ingreso','egreso') NOT NULL, categoria ENUM('pedido','compra') NOT NULL, concepto VARCHAR(255) NOT NULL,
 monto DECIMAL(12,2) NOT NULL, origen ENUM('pedido','compra') NOT NULL, origen_id INT UNSIGNED NOT NULL,
 anulado TINYINT(1) NOT NULL DEFAULT 0, fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, observaciones TEXT,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_caja_origen(id_usuario,origen,origen_id), INDEX idx_caja_fecha(id_usuario,fecha_movimiento), INDEX idx_caja_anulado(anulado),
 CONSTRAINT fk_caja_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE movimientos_stock (
 id_movimiento_stock INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, id_producto INT UNSIGNED NOT NULL,
 tipo ENUM('agregar','quitar','pedido','restauracion_pedido') NOT NULL, cantidad INT UNSIGNED NOT NULL,
 stock_anterior INT UNSIGNED NOT NULL, stock_nuevo INT UNSIGNED NOT NULL,
 origen VARCHAR(30) NOT NULL, origen_id INT UNSIGNED NULL, motivo VARCHAR(255), fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_ms_usuario(id_usuario), INDEX idx_ms_producto(id_producto), INDEX idx_ms_fecha(fecha_movimiento),
 CONSTRAINT fk_ms_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT fk_ms_producto FOREIGN KEY(id_producto) REFERENCES productos(id_producto)
) ENGINE=InnoDB;
