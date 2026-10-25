const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const database = `ciento_once_v2_test_${Date.now()}`;
if (!/^ciento_once_v2_test_\d+$/.test(database)) {
  throw new Error("Nombre de base temporal rechazado");
}

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  try {
    const source = fs.readFileSync(
      path.join(__dirname, "../../database/001_schema.sql"),
      "utf8",
    );
    const schema = source.replaceAll("ciento_once_v2", database);
    await connection.query(schema);
    console.log(`Base aislada creada: ${database}`);
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["tests/integration.js"], {
        cwd: path.join(__dirname, ".."),
        stdio: "inherit",
        env: {
          ...process.env,
          DB_NAME: database,
          REQUIRE_EMAIL_VERIFICATION: "false",
          NODE_ENV: "test",
        },
      });
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0)
      throw new Error(`Las pruebas terminaron con código ${exitCode}`);
  } finally {
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.end();
    console.log(`Base aislada eliminada: ${database}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
