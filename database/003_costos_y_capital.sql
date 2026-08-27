USE ciento_once_v2;

ALTER TABLE movimientos_caja
  MODIFY categoria ENUM('pedido','compra','capital') NOT NULL,
  MODIFY origen ENUM('pedido','compra','manual') NOT NULL,
  MODIFY origen_id INT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS costos_productos (
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
