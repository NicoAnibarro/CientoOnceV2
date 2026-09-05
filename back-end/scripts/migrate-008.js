const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../database/008_identidad_flyers.sql'), 'utf8').replace(/^USE\s+[^;]+;/im, '');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
    multipleStatements: true
  });
  try {
    await connection.query(sql);
    console.log('Migración 008 terminada correctamente');
  } finally {
    await connection.end();
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
