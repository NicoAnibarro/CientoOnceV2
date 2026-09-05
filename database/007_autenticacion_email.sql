USE ciento_once_v2;

ALTER TABLE usuarios
  ADD COLUMN email_verificado TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash,
  ADD COLUMN fecha_verificacion_email DATETIME NULL AFTER email_verificado,
  ADD COLUMN sesion_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER fecha_verificacion_email;

UPDATE usuarios
SET email_verificado=1,
    fecha_verificacion_email=COALESCE(fecha_verificacion_email,fecha_creacion);

CREATE TABLE IF NOT EXISTS tokens_autenticacion (
  id_token_autenticacion BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  proposito ENUM('verificar_email','recuperar_password') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  codigo_hash CHAR(64) NOT NULL,
  vence_en DATETIME NOT NULL,
  usado_en DATETIME NULL,
  intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_token_hash (token_hash),
  INDEX idx_token_usuario_proposito (id_usuario,proposito,vence_en),
  CONSTRAINT fk_token_auth_usuario
    FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;
