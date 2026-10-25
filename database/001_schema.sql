CREATE DATABASE IF NOT EXISTS ciento_once_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ciento_once_v2;

CREATE TABLE usuarios (
 id_usuario INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
 email VARCHAR(150) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
 email_verificado TINYINT(1) NOT NULL DEFAULT 0, fecha_verificacion_email DATETIME NULL,
 sesion_version INT UNSIGNED NOT NULL DEFAULT 0,
 activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tokens_autenticacion (
 id_token_autenticacion BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_usuario INT UNSIGNED NOT NULL,
 proposito ENUM('verificar_email','recuperar_password') NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE, codigo_hash CHAR(64) NOT NULL,
 vence_en DATETIME NOT NULL, usado_en DATETIME NULL, intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_token_usuario_proposito(id_usuario,proposito,vence_en),
 CONSTRAINT fk_token_auth_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE clientes (
 id_cliente INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, nombre VARCHAR(100) NOT NULL,
 telefono VARCHAR(40), direccion VARCHAR(255), latitud DECIMAL(10,7) NULL, longitud DECIMAL(10,7) NULL, google_place_id VARCHAR(255) NULL, ubicacion_origen ENUM('manual','busqueda','mapa','actual') NULL, instrucciones_entrega VARCHAR(255) NULL, observacion TEXT, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_clientes_usuario_nombre (id_usuario,nombre), INDEX idx_clientes_activo (activo), INDEX idx_clientes_coordenadas (id_usuario,latitud,longitud),
 CONSTRAINT fk_clientes_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE productos (
 id_producto INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, nombre VARCHAR(120) NOT NULL,
 descripcion TEXT, categoria VARCHAR(80) NOT NULL DEFAULT 'Dulce', costo_estimado DECIMAL(12,2) NOT NULL DEFAULT 0,
 precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0, stock_actual INT UNSIGNED NOT NULL DEFAULT 0, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_productos_usuario_nombre (id_usuario,nombre), INDEX idx_productos_categoria (categoria), INDEX idx_productos_activo (activo),
 CONSTRAINT fk_productos_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT chk_producto_importes CHECK(costo_estimado>=0 AND precio_venta>=0)
) ENGINE=InnoDB;

CREATE TABLE categorias_productos (
 id_categoria INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL,
 nombre VARCHAR(80) NOT NULL, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_categoria_usuario_nombre(id_usuario,nombre), INDEX idx_categoria_usuario_activo(id_usuario,activo),
 CONSTRAINT fk_categoria_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
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
 metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo', pago_detalle_json JSON NULL, fecha_pago DATETIME NULL,
 subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, descuento_tipo ENUM('porcentaje','fijo') NULL,
 descuento_valor DECIMAL(12,2) NOT NULL DEFAULT 0, descuento_importe DECIMAL(12,2) NOT NULL DEFAULT 0,
 total DECIMAL(12,2) NOT NULL, observaciones TEXT, activo TINYINT(1) NOT NULL DEFAULT 1,
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
 fecha_compra DATE NOT NULL, subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
 descuento_tipo ENUM('porcentaje','fijo') NULL, descuento_valor DECIMAL(12,2) NOT NULL DEFAULT 0,
 descuento_importe DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL,
 metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo', observaciones TEXT, activo TINYINT(1) NOT NULL DEFAULT 1,
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
 tipo ENUM('ingreso','egreso') NOT NULL, categoria ENUM('pedido','compra','capital') NOT NULL, concepto VARCHAR(255) NOT NULL,
 monto DECIMAL(12,2) NOT NULL, metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo',
 origen ENUM('pedido','compra','manual','vianda') NOT NULL, origen_id INT UNSIGNED NULL,
 anulado TINYINT(1) NOT NULL DEFAULT 0, fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, observaciones TEXT,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_caja_origen(id_usuario,origen,origen_id), INDEX idx_caja_fecha(id_usuario,fecha_movimiento), INDEX idx_caja_anulado(anulado),
 CONSTRAINT fk_caja_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE costos_productos (
 id_costo_producto INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_usuario INT UNSIGNED NOT NULL,
 nombre VARCHAR(150) NOT NULL,
 costo_total DECIMAL(12,2) NOT NULL,
 detalle_json JSON NULL,
 activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_costos_usuario_nombre(id_usuario,nombre),
 INDEX idx_costos_activo(activo),
 CONSTRAINT fk_costos_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT chk_costo_total CHECK(costo_total>=0)
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

CREATE TABLE cierres_caja (
 id_cierre_caja INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL,
 fecha_cierre DATE NOT NULL, efectivo_esperado DECIMAL(12,2) NOT NULL DEFAULT 0,
 efectivo_contado DECIMAL(12,2) NOT NULL DEFAULT 0, diferencia DECIMAL(12,2) NOT NULL DEFAULT 0,
 resumen_json JSON NULL, observaciones VARCHAR(500), fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_cierre_usuario_fecha(id_usuario,fecha_cierre),
 CONSTRAINT fk_cierre_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE empleados (
 id_empleado INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL,
 nombre VARCHAR(120) NOT NULL, rol ENUM('administrador','caja','ventas','reparto') NOT NULL DEFAULT 'ventas',
 permisos_json JSON NULL, pin_hash VARCHAR(255) NULL, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_empleado_usuario(id_usuario,activo),
 CONSTRAINT fk_empleado_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE configuraciones_comerciales (
 id_usuario INT UNSIGNED PRIMARY KEY, nombre_negocio VARCHAR(150), telefono VARCHAR(50), direccion VARCHAR(255), cuit VARCHAR(20),
 mercado_pago_activo TINYINT(1) NOT NULL DEFAULT 0, arca_activo TINYINT(1) NOT NULL DEFAULT 0,
 arca_ambiente ENUM('homologacion','produccion') NOT NULL DEFAULT 'homologacion', arca_punto_venta INT NULL,
 paleta_visual VARCHAR(30) NOT NULL DEFAULT 'verde_crema', paleta_app VARCHAR(30) NOT NULL DEFAULT 'verde',
 logo_mime VARCHAR(40) NULL, logo_imagen MEDIUMBLOB NULL,
 fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_config_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE pagos_integracion (
 id_pago_integracion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL,
 proveedor VARCHAR(30) NOT NULL, proveedor_pago_id VARCHAR(120) NOT NULL, id_pedido INT UNSIGNED NULL,
 estado VARCHAR(40) NOT NULL, monto DECIMAL(12,2) NOT NULL DEFAULT 0, payload_json JSON NULL,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_pago_proveedor(proveedor,proveedor_pago_id), INDEX idx_pago_usuario_pedido(id_usuario,id_pedido),
 CONSTRAINT fk_pago_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE tipos_vianda (
 id_tipo_vianda INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL,
 nombre VARCHAR(100) NOT NULL, precio_base DECIMAL(12,2) NOT NULL DEFAULT 0, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_tipo_vianda_usuario_nombre(id_usuario,nombre), INDEX idx_tipo_vianda_usuario_activo(id_usuario,activo),
 CONSTRAINT fk_tipo_vianda_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario), CONSTRAINT chk_tipo_vianda_precio CHECK(precio_base>=0)
) ENGINE=InnoDB;

CREATE TABLE configuraciones_viandas (
 id_usuario INT UNSIGNED PRIMARY KEY, precio_postre DECIMAL(12,2) NOT NULL DEFAULT 0, precio_envio DECIMAL(12,2) NOT NULL DEFAULT 0,
 fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_config_vianda_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT chk_config_vianda_importes CHECK(precio_postre>=0 AND precio_envio>=0)
) ENGINE=InnoDB;

CREATE TABLE series_viandas (
 id_serie CHAR(36) PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, id_cliente INT UNSIGNED NULL,
 cliente_nombre VARCHAR(100), cliente_telefono VARCHAR(40), cliente_direccion VARCHAR(255),
 frecuencia ENUM('unico','diario','semanal','mensual') NOT NULL DEFAULT 'unico', fecha_inicio DATE NOT NULL, fecha_fin DATE NOT NULL,
 dias_semana_json JSON NULL, metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo', total_plan DECIMAL(12,2) NOT NULL DEFAULT 0,
 monto_pagado DECIMAL(12,2) NOT NULL DEFAULT 0, pagado TINYINT(1) NOT NULL DEFAULT 0, observaciones TEXT, activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_serie_vianda_usuario(id_usuario,fecha_inicio,fecha_fin), INDEX idx_serie_vianda_cliente(id_usuario,id_cliente,activo),
 CONSTRAINT fk_serie_vianda_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT fk_serie_vianda_cliente FOREIGN KEY(id_cliente) REFERENCES clientes(id_cliente),
 CONSTRAINT chk_serie_vianda_importes CHECK(total_plan>=0 AND monto_pagado>=0)
) ENGINE=InnoDB;

CREATE TABLE pedidos_viandas (
 id_pedido_vianda INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, id_serie CHAR(36) NOT NULL,
 id_cliente INT UNSIGNED NOT NULL, cliente_nombre VARCHAR(100) NOT NULL, cliente_telefono VARCHAR(40), cliente_direccion VARCHAR(255),
 id_tipo_vianda INT UNSIGNED NOT NULL, tipo_nombre VARCHAR(100) NOT NULL, cantidad SMALLINT UNSIGNED NOT NULL DEFAULT 1,
 precio_unitario DECIMAL(12,2) NOT NULL DEFAULT 0, con_postre TINYINT(1) NOT NULL DEFAULT 0,
 precio_postre_unitario DECIMAL(12,2) NOT NULL DEFAULT 0, con_envio TINYINT(1) NOT NULL DEFAULT 0, costo_envio DECIMAL(12,2) NOT NULL DEFAULT 0,
 subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, descuento_tipo ENUM('porcentaje','fijo') NULL,
 descuento_valor DECIMAL(12,2) NOT NULL DEFAULT 0, descuento_importe DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0,
 fecha_entrega DATE NOT NULL, hora_entrega TIME NOT NULL, estado ENUM('pendiente','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
 pagado TINYINT(1) NOT NULL DEFAULT 0, fecha_pago DATETIME NULL, metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo', observaciones TEXT,
 activo TINYINT(1) NOT NULL DEFAULT 1, fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_vianda_usuario_entrega(id_usuario,fecha_entrega,hora_entrega), INDEX idx_vianda_usuario_estado(id_usuario,estado,pagado), INDEX idx_vianda_serie(id_serie),
 CONSTRAINT fk_vianda_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT fk_vianda_serie FOREIGN KEY(id_serie) REFERENCES series_viandas(id_serie),
 CONSTRAINT fk_vianda_cliente FOREIGN KEY(id_cliente) REFERENCES clientes(id_cliente),
 CONSTRAINT fk_vianda_tipo FOREIGN KEY(id_tipo_vianda) REFERENCES tipos_vianda(id_tipo_vianda),
 CONSTRAINT chk_vianda_importes CHECK(cantidad>0 AND precio_unitario>=0 AND precio_postre_unitario>=0 AND costo_envio>=0 AND subtotal>=0 AND descuento_valor>=0 AND descuento_importe>=0 AND total>=0)
) ENGINE=InnoDB;

CREATE TABLE pedido_vianda_detalles (
 id_pedido_vianda_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL,
 id_pedido_vianda INT UNSIGNED NOT NULL, id_tipo_vianda INT UNSIGNED NOT NULL, tipo_nombre VARCHAR(100) NOT NULL,
 cantidad SMALLINT UNSIGNED NOT NULL DEFAULT 1, precio_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
 con_postre TINYINT(1) NOT NULL DEFAULT 0, precio_postre_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
 subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_pvd_usuario_pedido(id_usuario,id_pedido_vianda), INDEX idx_pvd_tipo(id_tipo_vianda),
 CONSTRAINT fk_pvd_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT fk_pvd_pedido FOREIGN KEY(id_pedido_vianda) REFERENCES pedidos_viandas(id_pedido_vianda),
 CONSTRAINT fk_pvd_tipo FOREIGN KEY(id_tipo_vianda) REFERENCES tipos_vianda(id_tipo_vianda),
 CONSTRAINT chk_pvd_importes CHECK(cantidad>0 AND precio_unitario>=0 AND precio_postre_unitario>=0 AND subtotal>=0)
) ENGINE=InnoDB;

CREATE TABLE pagos_viandas (
 id_pago_vianda INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNSIGNED NOT NULL, id_serie CHAR(36) NOT NULL,
 id_pedido_vianda INT UNSIGNED NULL, monto DECIMAL(12,2) NOT NULL, metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo',
 fecha_pago DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, observaciones VARCHAR(255), activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_pago_vianda_usuario_serie(id_usuario,id_serie,activo), INDEX idx_pago_vianda_fecha(id_usuario,fecha_pago),
 UNIQUE KEY uq_pago_vianda_entrega(id_usuario,id_pedido_vianda),
 CONSTRAINT fk_pago_vianda_usuario FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT fk_pago_vianda_serie FOREIGN KEY(id_serie) REFERENCES series_viandas(id_serie),
 CONSTRAINT fk_pago_vianda_pedido FOREIGN KEY(id_pedido_vianda) REFERENCES pedidos_viandas(id_pedido_vianda),
 CONSTRAINT chk_pago_vianda_monto CHECK(monto>0)
) ENGINE=InnoDB;
