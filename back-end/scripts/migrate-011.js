const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function run() {
  const host = String(process.env.DB_HOST || "localhost").trim().toLowerCase();
  const database = String(process.env.DB_NAME || "").trim();
  if (!["localhost", "127.0.0.1", "::1"].includes(host))
    throw new Error("Esta migración sólo admite la base MySQL local");
  if (database !== "ciento_once_v2")
    throw new Error(
      `Base rechazada: se esperaba ciento_once_v2 y se recibió ${database || "(vacía)"}`,
    );
  const connection = await mysql.createConnection({
    host,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    multipleStatements: true,
  });
  try {
    const [[columns]] = await connection.query(
      `SELECT COUNT(*) count FROM information_schema.columns
       WHERE table_schema=? AND table_name='series_viandas'
       AND column_name IN ('id_cliente','total_plan','monto_pagado','pagado')`,
      [database],
    );
    const [[tables]] = await connection.query(
      `SELECT COUNT(*) count FROM information_schema.tables
       WHERE table_schema=? AND table_name IN ('pedido_vianda_detalles','pagos_viandas')`,
      [database],
    );
    const completed = Number(columns.count) === 4 && Number(tables.count) === 2;
    if (completed) {
      console.log("Migración 011 omitida: ya estaba aplicada");
      return;
    }
    if (Number(columns.count) || Number(tables.count))
      throw new Error("La migración 011 está parcialmente aplicada; no se modificó la base");
    const sql = fs.readFileSync(
      path.join(__dirname, "../../database/011_viandas_planes_pagos.sql"),
      "utf8",
    );
    await connection.query(sql);
    console.log("Migración local 011 aplicada correctamente");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`No se pudo migrar la base local: ${error.message}`);
  process.exit(1);
});
