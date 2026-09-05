const fs = require('fs');
const path = require('path');
require('dotenv').config();
const db = require('../src/config/db');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../../database/007_autenticacion_email.sql'), 'utf8');
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
      if (!/^USE\s/i.test(statement)) await db.query(statement);
    }
    console.log('Migración 007 terminada correctamente');
  } finally {
    await db.end();
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
