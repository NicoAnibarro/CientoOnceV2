const db = require('../config/db');
const { numero, entero } = require('../utils/numeros');
const { fechaValida } = require('../utils/fechas');

async function cajaPedido(connection, userId, orderId, total, paid) {
  if (paid) {
    await connection.query(`INSERT INTO movimientos_caja
      (id_usuario,tipo,categoria,concepto,monto,origen,origen_id,anulado)
      VALUES(?,'ingreso','pedido',?,?,'pedido',?,0)
      ON DUPLICATE KEY UPDATE monto=VALUES(monto),anulado=0,fecha_movimiento=NOW()`,
    [userId, `Pago de pedido #${orderId}`, total, orderId]);
  } else {
    await connection.query("UPDATE movimientos_caja SET anulado=1 WHERE id_usuario=? AND origen='pedido' AND origen_id=?", [userId, orderId]);
  }
}

async function restaurarStock(connection, userId, orderId) {
  const [details] = await connection.query('SELECT * FROM pedido_detalles WHERE id_usuario=? AND id_pedido=? FOR UPDATE', [userId, orderId]);
  for (const detail of details) {
    if (!detail.cantidad_stock_descontada) continue;
    const [[product]] = await connection.query('SELECT stock_actual FROM productos WHERE id_producto=? AND id_usuario=? FOR UPDATE', [detail.id_producto, userId]);
    if (!product) continue;
    const newStock = product.stock_actual + detail.cantidad_stock_descontada;
    await connection.query('UPDATE productos SET stock_actual=? WHERE id_producto=? AND id_usuario=?', [newStock, detail.id_producto, userId]);
    await connection.query('UPDATE pedido_detalles SET cantidad_stock_descontada=0 WHERE id_pedido_detalle=? AND id_usuario=?', [detail.id_pedido_detalle, userId]);
    await connection.query(`INSERT INTO movimientos_stock
      (id_usuario,id_producto,tipo,cantidad,stock_anterior,stock_nuevo,origen,origen_id,motivo)
      VALUES(?,?,'restauracion_pedido',?,?,?,'pedido',?,'Pedido volvió a pendiente o fue eliminado')`,
    [userId, detail.id_producto, detail.cantidad_stock_descontada, product.stock_actual, newStock, orderId]);
  }
}

async function descontarStock(connection, userId, orderId) {
  const [details] = await connection.query('SELECT * FROM pedido_detalles WHERE id_usuario=? AND id_pedido=? FOR UPDATE', [userId, orderId]);
  for (const detail of details) {
    const [[product]] = await connection.query('SELECT stock_actual FROM productos WHERE id_producto=? AND id_usuario=? FOR UPDATE', [detail.id_producto, userId]);
    if (!product) continue;
    const discount = Math.min(product.stock_actual, detail.cantidad);
    const newStock = product.stock_actual - discount;
    await connection.query('UPDATE productos SET stock_actual=? WHERE id_producto=? AND id_usuario=?', [newStock, detail.id_producto, userId]);
    await connection.query('UPDATE pedido_detalles SET cantidad_stock_descontada=? WHERE id_pedido_detalle=? AND id_usuario=?', [discount, detail.id_pedido_detalle, userId]);
    if (discount) await connection.query(`INSERT INTO movimientos_stock
      (id_usuario,id_producto,tipo,cantidad,stock_anterior,stock_nuevo,origen,origen_id,motivo)
      VALUES(?,?,'pedido',?,?,?,'pedido',?,'Pedido entregado')`,
    [userId, detail.id_producto, discount, product.stock_actual, newStock, orderId]);
  }
}

async function crearDetalles(connection, userId, orderId, items) {
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('Agrega al menos un producto'), { status: 400 });
  let total = 0;
  for (const item of items) {
    const quantity = entero(Number(item.cantidad));
    if (!quantity || quantity < 1) throw Object.assign(new Error('Cantidad inválida'), { status: 400 });
    const [[product]] = await connection.query('SELECT id_producto,nombre,precio_venta FROM productos WHERE id_producto=? AND id_usuario=? AND activo=1', [item.id_producto, userId]);
    if (!product) throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
    const subtotal = Number((product.precio_venta * quantity).toFixed(2));
    total += subtotal;
    await connection.query(`INSERT INTO pedido_detalles
      (id_usuario,id_pedido,id_producto,producto_nombre,precio_unitario,cantidad,subtotal,cantidad_stock_descontada)
      VALUES(?,?,?,?,?,?,?,0)`, [userId, orderId, product.id_producto, product.nombre, product.precio_venta, quantity, subtotal]);
  }
  return Number(total.toFixed(2));
}

exports.listarPedidos = async (req, res) => {
  let where = 'p.id_usuario=? AND p.activo=1'; const args = [req.usuario.id_usuario];
  if (req.path.includes('entregados')) where += " AND p.estado='entregado'";
  if (req.path.includes('proximos')) where += " AND p.fecha_entrega>=CURDATE() AND p.estado<>'cancelado'";
  if (req.query.estado) { where += ' AND p.estado=?'; args.push(req.query.estado); }
  if (req.query.search) { where += ' AND p.cliente_nombre LIKE ?'; args.push(`%${req.query.search}%`); }
  const [rows] = await db.query(`SELECT p.*,(SELECT GROUP_CONCAT(CONCAT(producto_nombre,' x',cantidad) SEPARATOR ', ') FROM pedido_detalles d WHERE d.id_pedido=p.id_pedido) detalle_resumido FROM pedidos p WHERE ${where} ORDER BY p.fecha_entrega ${req.query.orden === 'desc' ? 'DESC' : 'ASC'} LIMIT 100`, args);
  res.json({ ok: true, data: rows });
};

exports.verPedido = async (req, res) => {
  const [[order]] = await db.query('SELECT * FROM pedidos WHERE id_pedido=? AND id_usuario=? AND activo=1', [req.params.id, req.usuario.id_usuario]);
  if (!order) return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
  const [details] = await db.query('SELECT * FROM pedido_detalles WHERE id_pedido=? AND id_usuario=?', [order.id_pedido, req.usuario.id_usuario]);
  res.json({ ok: true, data: { ...order, detalles: details } });
};

exports.crearPedido = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction(); const userId = req.usuario.id_usuario;
    if (!fechaValida(req.body.fecha_entrega)) throw Object.assign(new Error('Fecha de entrega inválida'), { status: 400 });
    const [[client]] = await connection.query('SELECT * FROM clientes WHERE id_cliente=? AND id_usuario=? AND activo=1', [req.body.id_cliente, userId]);
    if (!client) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });
    const [result] = await connection.query(`INSERT INTO pedidos
      (id_usuario,id_cliente,cliente_nombre,cliente_telefono,cliente_direccion,fecha_entrega,pagado,fecha_pago,total,observaciones)
      VALUES(?,?,?,?,?,?,?,IF(?=1,NOW(),NULL),0,?)`, [userId, client.id_cliente, client.nombre, client.telefono, client.direccion, req.body.fecha_entrega, req.body.pagado ? 1 : 0, req.body.pagado ? 1 : 0, req.body.observaciones || null]);
    const total = await crearDetalles(connection, userId, result.insertId, req.body.detalles);
    await connection.query('UPDATE pedidos SET total=? WHERE id_pedido=?', [total, result.insertId]);
    await cajaPedido(connection, userId, result.insertId, total, req.body.pagado);
    await connection.commit(); res.status(201).json({ ok: true, mensaje: 'Pedido creado', data: { id_pedido: result.insertId, total } });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

exports.editarPedido = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction(); const userId = req.usuario.id_usuario; const orderId = req.params.id;
    const [[old]] = await connection.query('SELECT * FROM pedidos WHERE id_pedido=? AND id_usuario=? AND activo=1 FOR UPDATE', [orderId, userId]);
    if (!old) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
    const [[client]] = await connection.query('SELECT * FROM clientes WHERE id_cliente=? AND id_usuario=? AND activo=1', [req.body.id_cliente, userId]);
    if (!client) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });
    await restaurarStock(connection, userId, orderId);
    await connection.query('DELETE FROM pedido_detalles WHERE id_pedido=? AND id_usuario=?', [orderId, userId]);
    const total = await crearDetalles(connection, userId, orderId, req.body.detalles); const state = req.body.estado || 'pendiente';
    if (state === 'entregado') await descontarStock(connection, userId, orderId);
    await connection.query(`UPDATE pedidos SET id_cliente=?,cliente_nombre=?,cliente_telefono=?,cliente_direccion=?,fecha_entrega=?,estado=?,pagado=?,fecha_pago=IF(?=1,COALESCE(fecha_pago,NOW()),NULL),total=?,observaciones=? WHERE id_pedido=? AND id_usuario=?`, [client.id_cliente, client.nombre, client.telefono, client.direccion, req.body.fecha_entrega, state, req.body.pagado ? 1 : 0, req.body.pagado ? 1 : 0, total, req.body.observaciones || null, orderId, userId]);
    await cajaPedido(connection, userId, orderId, total, req.body.pagado);
    await connection.commit(); res.json({ ok: true, mensaje: 'Pedido actualizado', data: { total } });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

exports.estado = async (req, res) => {
  if (!['pendiente', 'entregado', 'cancelado'].includes(req.body.estado)) return res.status(400).json({ ok: false, mensaje: 'Estado inválido' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction(); const userId = req.usuario.id_usuario; const orderId = req.params.id;
    const [[order]] = await connection.query('SELECT estado FROM pedidos WHERE id_pedido=? AND id_usuario=? AND activo=1 FOR UPDATE', [orderId, userId]);
    if (!order) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
    if (order.estado !== 'entregado' && req.body.estado === 'entregado') await descontarStock(connection, userId, orderId);
    if (order.estado === 'entregado' && req.body.estado !== 'entregado') await restaurarStock(connection, userId, orderId);
    await connection.query('UPDATE pedidos SET estado=? WHERE id_pedido=? AND id_usuario=?', [req.body.estado, orderId, userId]);
    await connection.commit(); res.json({ ok: true, mensaje: 'Estado actualizado' });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

exports.pagado = async (req, res) => {
  const connection = await db.getConnection();
  try { await connection.beginTransaction(); const [[order]] = await connection.query('SELECT total FROM pedidos WHERE id_pedido=? AND id_usuario=? AND activo=1 FOR UPDATE', [req.params.id, req.usuario.id_usuario]); if (!order) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 }); const paid = !!req.body.pagado; await connection.query('UPDATE pedidos SET pagado=?,fecha_pago=IF(?=1,NOW(),NULL) WHERE id_pedido=? AND id_usuario=?', [paid, paid, req.params.id, req.usuario.id_usuario]); await cajaPedido(connection, req.usuario.id_usuario, req.params.id, order.total, paid); await connection.commit(); res.json({ ok: true, mensaje: 'Pago actualizado' }); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

exports.eliminarPedido = async (req, res) => {
  const connection = await db.getConnection();
  try { await connection.beginTransaction(); const [[order]] = await connection.query('SELECT id_pedido FROM pedidos WHERE id_pedido=? AND id_usuario=? AND activo=1 FOR UPDATE', [req.params.id, req.usuario.id_usuario]); if (!order) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 }); await restaurarStock(connection, req.usuario.id_usuario, order.id_pedido); await connection.query('UPDATE pedidos SET activo=0 WHERE id_pedido=? AND id_usuario=?', [order.id_pedido, req.usuario.id_usuario]); await cajaPedido(connection, req.usuario.id_usuario, order.id_pedido, 0, false); await connection.commit(); res.json({ ok: true, mensaje: 'Pedido eliminado' }); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

exports.stock = async (req, res) => { const [rows] = await db.query('SELECT id_producto,nombre,categoria,stock_actual FROM productos WHERE id_usuario=? AND activo=1 AND stock_actual>0 ORDER BY nombre', [req.usuario.id_usuario]); res.json({ ok: true, data: rows }); };
exports.moverStock = async (req, res) => { const quantity = entero(Number(req.body.cantidad)); if (!['agregar','quitar'].includes(req.body.tipo) || !quantity || quantity < 1) return res.status(400).json({ ok: false, mensaje: 'Movimiento inválido' }); const connection = await db.getConnection(); try { await connection.beginTransaction(); const [[product]] = await connection.query('SELECT stock_actual FROM productos WHERE id_producto=? AND id_usuario=? AND activo=1 FOR UPDATE', [req.params.id, req.usuario.id_usuario]); if (!product) throw Object.assign(new Error('Producto no encontrado'), { status: 404 }); const newStock = req.body.tipo === 'agregar' ? product.stock_actual + quantity : product.stock_actual - quantity; if (newStock < 0) throw Object.assign(new Error('El stock no puede quedar negativo'), { status: 400 }); await connection.query('UPDATE productos SET stock_actual=? WHERE id_producto=? AND id_usuario=?', [newStock, req.params.id, req.usuario.id_usuario]); await connection.query('INSERT INTO movimientos_stock(id_usuario,id_producto,tipo,cantidad,stock_anterior,stock_nuevo,origen,motivo) VALUES(?,?,?,?,?,?,?,?)', [req.usuario.id_usuario, req.params.id, req.body.tipo, quantity, product.stock_actual, newStock, 'manual', req.body.motivo || null]); await connection.commit(); res.json({ ok: true, mensaje: 'Stock actualizado', data: { stock_actual: newStock } }); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } };

exports.crearCompra = async (req, res) => { if (!Array.isArray(req.body.detalles) || !req.body.detalles.length) return res.status(400).json({ ok: false, mensaje: 'Agrega al menos un insumo' }); const connection = await db.getConnection(); try { await connection.beginTransaction(); let total = 0; const items = []; for (const detail of req.body.detalles) { const quantity = numero(detail.cantidad); const price = numero(detail.precio_unitario); if (!quantity || quantity <= 0 || price === null || price < 0) throw Object.assign(new Error('Detalle de compra inválido'), { status: 400 }); const [[supply]] = await connection.query('SELECT id_insumo,nombre FROM insumos WHERE id_insumo=? AND id_usuario=? AND activo=1', [detail.id_insumo, req.usuario.id_usuario]); if (!supply) throw Object.assign(new Error('Insumo no encontrado'), { status: 404 }); const subtotal = Number((quantity * price).toFixed(2)); total += subtotal; items.push({ ...supply, quantity, price, subtotal }); } total = Number(total.toFixed(2)); const [result] = await connection.query('INSERT INTO compras(id_usuario,proveedor,fecha_compra,total,observaciones) VALUES(?,?,?,?,?)', [req.usuario.id_usuario, String(req.body.proveedor || '').trim() || 'Sin especificar', req.body.fecha_compra, total, req.body.observaciones || null]); for (const item of items) await connection.query('INSERT INTO compra_detalles(id_usuario,id_compra,id_insumo,insumo_nombre,cantidad,precio_unitario,subtotal) VALUES(?,?,?,?,?,?,?)', [req.usuario.id_usuario, result.insertId, item.id_insumo, item.nombre, item.quantity, item.price, item.subtotal]); await connection.query("INSERT INTO movimientos_caja(id_usuario,tipo,categoria,concepto,monto,origen,origen_id) VALUES(?,'egreso','compra',?,?,'compra',?)", [req.usuario.id_usuario, `Compra #${result.insertId}`, total, result.insertId]); await connection.commit(); res.status(201).json({ ok: true, mensaje: 'Compra registrada', data: { id_compra: result.insertId, total } }); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } };
exports.compras = async (req, res) => { const [rows] = await db.query('SELECT * FROM compras WHERE id_usuario=? AND activo=1 ORDER BY fecha_compra DESC,id_compra DESC', [req.usuario.id_usuario]); res.json({ ok: true, data: rows }); };
exports.compra = async (req, res) => { const [[purchase]] = await db.query('SELECT * FROM compras WHERE id_compra=? AND id_usuario=? AND activo=1', [req.params.id, req.usuario.id_usuario]); if (!purchase) return res.status(404).json({ ok: false, mensaje: 'Compra no encontrada' }); const [details] = await db.query('SELECT * FROM compra_detalles WHERE id_compra=? AND id_usuario=?', [purchase.id_compra, req.usuario.id_usuario]); res.json({ ok: true, data: { ...purchase, detalles: details } }); };
exports.caja = async (req, res) => { let where = 'id_usuario=?'; const args = [req.usuario.id_usuario]; if (req.query.tipo) { where += ' AND tipo=?'; args.push(req.query.tipo); } const [rows] = await db.query(`SELECT * FROM movimientos_caja WHERE ${where} ORDER BY fecha_movimiento ${req.query.orden === 'asc' ? 'ASC' : 'DESC'}`, args); res.json({ ok: true, data: rows }); };
exports.resumen = async (req, res) => { const [[summary]] = await db.query("SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' AND anulado=0 THEN monto ELSE 0 END),0) ingresos,COALESCE(SUM(CASE WHEN tipo='egreso' AND anulado=0 THEN monto ELSE 0 END),0) egresos FROM movimientos_caja WHERE id_usuario=?", [req.usuario.id_usuario]); summary.balance = summary.ingresos - summary.egresos; res.json({ ok: true, data: summary }); };
exports.dashboard = async (req, res) => { const [[user]] = await db.query('SELECT nombre FROM usuarios WHERE id_usuario=?', [req.usuario.id_usuario]); const [orders] = await db.query("SELECT id_pedido,cliente_nombre,fecha_entrega,total,estado,pagado FROM pedidos WHERE id_usuario=? AND activo=1 AND fecha_entrega>=CURDATE() AND estado<>'cancelado' ORDER BY estado='entregado',fecha_entrega LIMIT 10", [req.usuario.id_usuario]); res.json({ ok: true, data: { usuario: user, pedidos_proximos: orders } }); };
