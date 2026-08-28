const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env.production') });

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const [databases] = await connection.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','mysql','performance_schema','sys') ORDER BY schema_name",
    );
    const [tableCounts] = await connection.query(
      "SELECT table_schema,COUNT(*) cantidad FROM information_schema.tables WHERE table_schema NOT IN ('information_schema','mysql','performance_schema','sys') GROUP BY table_schema ORDER BY table_schema",
    );
    console.log({ databases, tableCounts });
    const [columns] = await connection.query(
      "SHOW COLUMNS FROM movimientos_caja WHERE Field IN ('categoria','origen','origen_id')",
    );
    const [categories] = await connection.query(
      'SELECT categoria,COUNT(*) cantidad FROM movimientos_caja GROUP BY categoria',
    );
    const [origins] = await connection.query(
      'SELECT origen,COUNT(*) cantidad FROM movimientos_caja GROUP BY origen',
    );
    console.log({ columns, categories, origins });
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
