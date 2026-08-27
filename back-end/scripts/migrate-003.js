const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

async function main() {
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(', ')}`);
  const sql = fs.readFileSync(path.resolve(__dirname, '../../database/003_costos_y_capital.sql'), 'utf8');
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_INITIAL_DATABASE || undefined, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined, multipleStatements: true });
  try { await connection.query(sql); console.log('Migración 003 terminada correctamente.'); }
  finally { await connection.end(); }
}

main().catch(error => { console.error(`No se pudo ejecutar la migración: ${error.message}`); process.exitCode = 1; });
