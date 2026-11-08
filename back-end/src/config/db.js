const { Pool, types } = require("pg");

// Mantiene los mismos tipos numéricos que entregaba mysql2 con decimalNumbers.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

const primaryKeys = {
  usuarios: "id_usuario",
  tokens_autenticacion: "id_token_autenticacion",
  clientes: "id_cliente",
  productos: "id_producto",
  categorias_productos: "id_categoria",
  insumos: "id_insumo",
  pedidos: "id_pedido",
  pedido_detalles: "id_pedido_detalle",
  compras: "id_compra",
  compra_detalles: "id_compra_detalle",
  movimientos_caja: "id_movimiento_caja",
  costos_productos: "id_costo_producto",
  movimientos_stock: "id_movimiento_stock",
  cierres_caja: "id_cierre_caja",
  empleados: "id_empleado",
  pagos_integracion: "id_pago_integracion",
  tipos_vianda: "id_tipo_vianda",
  pedidos_viandas: "id_pedido_vianda",
  pedido_vianda_detalles: "id_pedido_vianda_detalle",
  pagos_viandas: "id_pago_vianda",
};

function sslOptions() {
  if (process.env.DB_SSL !== "true") return undefined;
  const ca = process.env.DB_CA_CERT_BASE64
    ? Buffer.from(process.env.DB_CA_CERT_BASE64, "base64").toString("utf8")
    : undefined;
  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
    ...(ca ? { ca } : {}),
  };
}

const pool = new Pool({
  ...(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || 5432),
      }),
  ssl: sslOptions(),
  max: Number(process.env.DB_POOL_SIZE || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  application_name: "ciento-once-api",
  ...(process.env.DB_SCHEMA && /^[a-z_][a-z0-9_]*$/i.test(process.env.DB_SCHEMA)
    ? { options: `-c search_path=${process.env.DB_SCHEMA},public` }
    : {}),
});

function normalizeSql(sql) {
  let index = 0;
  let normalized = String(sql)
    .replace(/CURDATE\(\)/gi, "CURRENT_DATE")
    .replace(/\bLIKE\b/gi, "ILIKE")
    .replace(/\?/g, () => `$${++index}`);

  const insert = normalized.match(
    /^\s*INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/i,
  );
  if (insert && !/\bRETURNING\b/i.test(normalized)) {
    const primaryKey = primaryKeys[insert[1].toLowerCase()];
    if (primaryKey) {
      normalized = `${normalized.trim().replace(/;$/, "")} RETURNING ${primaryKey}`;
    }
  }
  return normalized;
}

function mysqlResult(result, sql) {
  if (result.command === "SELECT" || result.command === "SHOW") {
    return [result.rows, result.fields];
  }
  const insert = String(sql).match(
    /^\s*INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/i,
  );
  const primaryKey = insert ? primaryKeys[insert[1].toLowerCase()] : null;
  return [
    {
      insertId: primaryKey && result.rows[0] ? result.rows[0][primaryKey] : 0,
      affectedRows: result.rowCount || 0,
      changedRows: result.rowCount || 0,
    },
    result.fields,
  ];
}

async function runQuery(target, sql, params = []) {
  try {
    // La base original representaba los booleanos como TINYINT (0/1).
    // PostgreSQL no convierte true/false a SMALLINT de forma implícita,
    // por lo que preservamos aquí el contrato que esperan los controladores.
    const normalizedParams = params.map((value) =>
      typeof value === "boolean" ? (value ? 1 : 0) : value,
    );
    const result = await target.query(normalizeSql(sql), normalizedParams);
    return mysqlResult(result, sql);
  } catch (error) {
    if (error.code === "23505") {
      error.pgCode = error.code;
      error.code = "ER_DUP_ENTRY";
    }
    throw error;
  }
}

function wrapClient(client) {
  return {
    query: (sql, params) => runQuery(client, sql, params),
    execute: (sql, params) => runQuery(client, sql, params),
    beginTransaction: () => client.query("BEGIN"),
    commit: () => client.query("COMMIT"),
    rollback: () => client.query("ROLLBACK"),
    release: () => client.release(),
  };
}

module.exports = {
  query: (sql, params) => runQuery(pool, sql, params),
  execute: (sql, params) => runQuery(pool, sql, params),
  getConnection: async () => wrapClient(await pool.connect()),
  end: () => pool.end(),
  rawPool: pool,
};
