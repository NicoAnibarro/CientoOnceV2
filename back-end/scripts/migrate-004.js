const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, '../../database/004_gestion_comercial.sql'), 'utf8').replace(/^USE\s+[^;]+;/im, '');
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ssl: String(process.env.DB_SSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined, multipleStatements: true });
  try { await connection.query(sql); console.log('Migración 004 terminada correctamente'); } finally { await connection.end(); }
}
run().catch(error => { console.error('No se pudo aplicar la migración 004:', error.message); process.exit(1); });
