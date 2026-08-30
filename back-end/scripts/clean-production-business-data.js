const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env.production') });

const cleanedTables = [
  'pagos_integracion',
  'pedido_detalles',
  'pedidos',
  'compra_detalles',
  'compras',
  'cierres_caja',
  'movimientos_caja'
];
const preservedTables = [
  'clientes',
  'insumos',
  'productos',
  'costos_productos',
  'categorias_productos'
];

async function counts(connection, tables) {
  const result = {};
  for (const table of tables) {
    const [[row]] = await connection.query(`SELECT COUNT(*) count FROM ${table}`);
    result[table] = Number(row.count);
  }
  return result;
}

async function run() {
  if (process.env.ALLOW_PRODUCTION_CLEANUP !== 'YES') {
    throw new Error('Falta ALLOW_PRODUCTION_CLEANUP=YES');
  }
  const host = String(process.env.DB_HOST || '').trim();
  const database = String(process.env.DB_NAME || '').trim();
  if (!host || ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())) {
    throw new Error('La limpieza productiva rechaza conexiones locales');
  }
  if (database !== 'ciento_once_v2') {
    throw new Error(`Base rechazada: se esperaba ciento_once_v2 y se recibió ${database || '(vacía)'}`);
  }
  const connection = await mysql.createConnection({
    host,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    ssl: process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined
  });
  try {
    const beforeClean = await counts(connection, cleanedTables);
    const beforePreserved = await counts(connection, preservedTables);
    const [[stockBefore]] = await connection.query(
      'SELECT COUNT(*) productos,SUM(stock_actual) stock_total FROM productos'
    );
    console.log('A eliminar:', beforeClean);
    console.log('A preservar:', beforePreserved, 'stock:', stockBefore);
    await connection.beginTransaction();
    await connection.query("DELETE FROM movimientos_stock WHERE tipo IN ('pedido','restauracion_pedido')");
    for (const table of cleanedTables) await connection.query(`DELETE FROM ${table}`);
    await connection.commit();
    const afterClean = await counts(connection, cleanedTables);
    const afterPreserved = await counts(connection, preservedTables);
    const [[stockAfter]] = await connection.query(
      'SELECT COUNT(*) productos,SUM(stock_actual) stock_total FROM productos'
    );
    if (
      JSON.stringify(beforePreserved) !== JSON.stringify(afterPreserved) ||
      Number(stockBefore.stock_total || 0) !== Number(stockAfter.stock_total || 0)
    ) {
      throw new Error('La verificación detectó cambios en datos que debían preservarse');
    }
    console.log('Limpieza terminada:', afterClean);
    console.log('Datos preservados verificados:', afterPreserved, 'stock:', stockAfter);
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    await connection.end();
  }
}

run().catch(error => {
  console.error(`Limpieza detenida: ${error.message}`);
  process.exit(1);
});
