const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const schemaName = `ciento_once_v2_test_${Date.now()}`;
if (!/^ciento_once_v2_test_\d+$/.test(schemaName)) {
  throw new Error("Nombre de esquema temporal rechazado");
}

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

async function run() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: ssl(),
  });
  await client.connect();
  try {
    const source = fs.readFileSync(
      path.join(__dirname, "../../database/001_schema_postgresql.sql"),
      "utf8",
    );
    await client.query(`CREATE SCHEMA ${schemaName}`);
    await client.query(`SET search_path TO ${schemaName},public`);
    await client.query(source);
    console.log(`Esquema PostgreSQL aislado creado: ${schemaName}`);

    for (const test of ["tests/integration.js", "tests/stress.js"]) {
      const exitCode = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [test], {
          cwd: path.join(__dirname, ".."),
          stdio: "inherit",
          env: {
            ...process.env,
            DB_SCHEMA: schemaName,
            REQUIRE_EMAIL_VERIFICATION: "false",
            EMAIL_DELIVERY_ENABLED: "false",
            JWT_SECRET:
              process.env.JWT_SECRET ||
              require("node:crypto").randomBytes(48).toString("hex"),
            NODE_ENV: "test",
          },
        });
        child.once("error", reject);
        child.once("exit", (code) => resolve(code ?? 1));
      });
      if (exitCode !== 0) {
        throw new Error(`${test} terminó con código ${exitCode}`);
      }
    }
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await client.end();
    console.log(`Esquema PostgreSQL aislado eliminado: ${schemaName}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
