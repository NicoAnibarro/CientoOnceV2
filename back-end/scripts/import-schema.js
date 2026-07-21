const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

async function main() {
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) {
    throw new Error(`Faltan variables: ${missing.join(', ')}`);
  }

  const schemaPath = path.resolve(__dirname, '../../database/001_schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_INITIAL_DATABASE || undefined,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    multipleStatements: true,
  });

  try {
    await connection.query(schema);
    const [[result]] = await connection.query("SELECT COUNT(*) AS tablas FROM information_schema.tables WHERE table_schema='ciento_once_v2'");
    console.log(`Importación terminada correctamente. Tablas encontradas: ${result.tablas}`);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(`No se pudo importar el esquema: ${error.message}`);
  process.exitCode = 1;
});
