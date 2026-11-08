require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

async function main() {
  const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(", ")}`);

  const schemaPath = path.resolve(
    __dirname,
    "../../database/001_schema_postgresql.sql",
  );
  const schema = fs.readFileSync(schemaPath, "utf8");
  const ca = process.env.DB_CA_CERT_BASE64
    ? Buffer.from(process.env.DB_CA_CERT_BASE64, "base64").toString("utf8")
    : undefined;
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl:
      process.env.DB_SSL === "true"
        ? {
            rejectUnauthorized:
              process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
            ...(ca ? { ca } : {}),
          }
        : undefined,
  });

  await client.connect();
  try {
    await client.query(schema);
    const { rows } = await client.query(
      "SELECT COUNT(*)::int AS tablas FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    );
    console.log(
      `Importación PostgreSQL terminada correctamente. Tablas encontradas: ${rows[0].tablas}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`No se pudo importar el esquema PostgreSQL: ${error.message}`);
  process.exitCode = 1;
});
