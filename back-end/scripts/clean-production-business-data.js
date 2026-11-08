const path = require("node:path");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "../.env.production") });

const cleanedTables = [
  "pagos_integracion",
  "pedido_detalles",
  "pedidos",
  "compra_detalles",
  "compras",
  "pagos_viandas",
  "pedido_vianda_detalles",
  "pedidos_viandas",
  "series_viandas",
  "cierres_caja",
  "movimientos_stock",
  "movimientos_caja",
  "costos_productos",
  "insumos",
  "empleados",
];
const preservedTables = [
  "clientes",
  "productos",
  "categorias_productos",
  "configuraciones_comerciales",
  "configuraciones_viandas",
  "tipos_vianda",
  "usuarios",
];

function ssl() {
  if (process.env.DB_SSL !== "true") return undefined;
  const ca = process.env.DB_CA_CERT_BASE64
    ? Buffer.from(process.env.DB_CA_CERT_BASE64, "base64").toString("utf8")
    : undefined;
  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
    ...(ca ? { ca } : {}),
  };
}

async function counts(client, tables) {
  const result = {};
  for (const table of tables) {
    const { rows } = await client.query(`SELECT COUNT(*)::int count FROM ${table}`);
    result[table] = rows[0].count;
  }
  return result;
}

async function run() {
  if (process.env.ALLOW_PRODUCTION_CLEANUP !== "YES") {
    throw new Error("Falta ALLOW_PRODUCTION_CLEANUP=YES");
  }
  if (process.env.CLEANUP_TARGET !== "CientoOnceV2") {
    throw new Error("Falta CLEANUP_TARGET=CientoOnceV2");
  }
  const host = String(process.env.DB_HOST || "").trim();
  const database = String(process.env.DB_NAME || "").trim();
  if (!host || ["localhost", "127.0.0.1", "::1"].includes(host.toLowerCase())) {
    throw new Error("La limpieza productiva rechaza conexiones locales");
  }
  if (database !== "defaultdb" || !host.includes("aivencloud.com")) {
    throw new Error("El destino no es el PostgreSQL administrado de CientoOnce");
  }

  const client = new Client({
    host,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    ssl: ssl(),
  });
  await client.connect();
  try {
    const beforeClean = await counts(client, cleanedTables);
    const beforePreserved = await counts(client, preservedTables);
    const stockBefore = (
      await client.query(
        "SELECT COUNT(*)::int productos,COALESCE(SUM(stock_actual),0)::int stock_total FROM productos",
      )
    ).rows[0];
    console.log("A eliminar:", beforeClean);
    console.log("A preservar:", beforePreserved, "stock:", stockBefore);

    await client.query("BEGIN");
    for (const table of cleanedTables) await client.query(`DELETE FROM ${table}`);
    await client.query("UPDATE productos SET stock_actual=0");

    const afterClean = await counts(client, cleanedTables);
    const afterPreserved = await counts(client, preservedTables);
    const stockAfter = (
      await client.query(
        "SELECT COUNT(*)::int productos,COALESCE(SUM(stock_actual),0)::int stock_total FROM productos",
      )
    ).rows[0];
    if (
      Object.values(afterClean).some((value) => value !== 0) ||
      JSON.stringify(beforePreserved) !== JSON.stringify(afterPreserved) ||
      stockAfter.stock_total !== 0
    ) {
      throw new Error("La verificación detectó cambios en datos preservados");
    }
    await client.query("COMMIT");
    console.log("Limpieza terminada:", afterClean);
    console.log("Datos preservados verificados:", afterPreserved, "stock:", stockAfter);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(`Limpieza detenida: ${error.message}`);
  process.exit(1);
});
