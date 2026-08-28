const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env.production') });

const migrations = [
  {
    id: '003_costos_y_capital',
    file: '003_costos_y_capital.sql',
    checks: [
      ['table', 'costos_productos'],
      ['enum', 'movimientos_caja', 'categoria', "'capital'"],
      ['enum', 'movimientos_caja', 'origen', "'manual'"],
      ['nullable', 'movimientos_caja', 'origen_id'],
    ],
  },
  {
    id: '004_gestion_comercial',
    file: '004_gestion_comercial.sql',
    checks: [
      ['table', 'categorias_productos'],
      ['column', 'pedidos', 'subtotal'],
      ['column', 'pedidos', 'descuento_tipo'],
      ['column', 'pedidos', 'descuento_valor'],
      ['column', 'pedidos', 'descuento_importe'],
      ['column', 'compras', 'subtotal'],
      ['column', 'compras', 'descuento_tipo'],
      ['column', 'compras', 'descuento_valor'],
      ['column', 'compras', 'descuento_importe'],
    ],
  },
  {
    id: '005_geolocalizacion_clientes',
    file: '005_geolocalizacion_clientes.sql',
    checks: [
      ['column', 'clientes', 'latitud'],
      ['column', 'clientes', 'longitud'],
      ['column', 'clientes', 'google_place_id'],
      ['column', 'clientes', 'ubicacion_origen'],
      ['column', 'clientes', 'instrucciones_entrega'],
      ['index', 'clientes', 'idx_clientes_coordenadas'],
    ],
  },
  {
    id: '006_comercial',
    file: '006_comercial.sql',
    checks: [
      ['column', 'productos', 'stock_minimo'],
      ['column', 'pedidos', 'metodo_pago'],
      ['column', 'pedidos', 'pago_detalle_json'],
      ['column', 'compras', 'metodo_pago'],
      ['column', 'movimientos_caja', 'metodo_pago'],
      ['table', 'cierres_caja'],
      ['table', 'empleados'],
      ['table', 'configuraciones_comerciales'],
      ['table', 'pagos_integracion'],
    ],
  },
];

async function check(connection, rule, database) {
  const [kind, table, name, expected] = rule;
  if (kind === 'table') {
    const [[row]] = await connection.query(
      'SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=? AND table_name=?',
      [database, table],
    );
    return row.count === 1;
  }
  if (kind === 'index') {
    const [[row]] = await connection.query(
      'SELECT COUNT(*) count FROM information_schema.statistics WHERE table_schema=? AND table_name=? AND index_name=?',
      [database, table, name],
    );
    return row.count > 0;
  }
  const [[column]] = await connection.query(
    'SELECT column_type AS columnType,is_nullable AS isNullable FROM information_schema.columns WHERE table_schema=? AND table_name=? AND column_name=?',
    [database, table, name],
  );
  if (kind === 'column') return !!column;
  if (kind === 'nullable') return column?.columnType != null && column.isNullable === 'YES';
  if (kind === 'enum') return !!column && String(column.columnType).includes(expected);
  return false;
}

async function run() {
  if (process.env.ALLOW_PRODUCTION_MIGRATIONS !== 'YES') {
    throw new Error('Falta ALLOW_PRODUCTION_MIGRATIONS=YES');
  }
  const host = String(process.env.DB_HOST || '').trim();
  if (!host || ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())) {
    throw new Error('La migración productiva rechaza conexiones locales');
  }
  const database = String(process.env.DB_NAME || '').trim();
  if (!database) throw new Error('Falta DB_NAME');
  const connection = await mysql.createConnection({
    host,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    ssl: process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined,
    multipleStatements: true,
  });
  try {
    await connection.query('SELECT 1');
    console.log(`Conexión verificada con ${host} / ${database}`);
    for (const migration of migrations) {
      const results = [];
      for (const rule of migration.checks) results.push(await check(connection, rule, database));
      const completed = results.filter(Boolean).length;
      if (completed === migration.checks.length) {
        console.log(`OMITIDA ${migration.id}: ya estaba aplicada`);
        continue;
      }
      if (completed > 0 && migration.id !== '003_costos_y_capital') {
        throw new Error(`La migración ${migration.id} está parcialmente aplicada (${completed}/${migration.checks.length}). No se modificó esa etapa.`);
      }
      if (migration.id === '003_costos_y_capital') {
        const [categories] = await connection.query(
          "SELECT DISTINCT categoria FROM movimientos_caja WHERE LOWER(categoria) NOT IN ('pedido','pedidos','venta','ventas','compra','capital','inversion','inversión','retiro') AND LOWER(categoria) NOT LIKE 'compra%'",
        );
        if (categories.length) {
          throw new Error(`Hay categorías históricas desconocidas: ${categories.map((item) => item.categoria).join(', ')}`);
        }
        if (completed > 0) console.log(`REPARANDO ${migration.id}: estado parcial seguro (${completed}/${migration.checks.length})`);
      }
      const sql = fs.readFileSync(path.join(__dirname, '../../database', migration.file), 'utf8')
        .replace(/^USE\s+[^;]+;/im, '');
      await connection.query(sql);
      console.log(`APLICADA ${migration.id}`);
    }
    const [[tables]] = await connection.query(
      'SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=?',
      [database],
    );
    console.log(`Migración productiva terminada. Tablas encontradas: ${tables.count}`);
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migración detenida: ${error.message}`);
  process.exit(1);
});
