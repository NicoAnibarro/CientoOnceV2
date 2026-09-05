const db = require('../config/db');
const { numero, entero } = require('../utils/numeros');
const { fechaValida } = require('../utils/fechas');

function calcularDescuento(subtotal, body) {
  const tipo = body.descuento_tipo || null;
  const valor = numero(body.descuento_valor || 0) || 0;
  if (!tipo || valor === 0) return { tipo: null, valor: 0, importe: 0, total: subtotal };
  if (!['porcentaje', 'fijo'].includes(tipo) || valor < 0 || (tipo === 'porcentaje' && valor > 100)) throw Object.assign(new Error('Descuento inválido'), { status: 400 });
  const importe = Number((tipo === 'porcentaje' ? subtotal * valor / 100 : valor).toFixed(2));
  if (importe > subtotal) throw Object.assign(new Error('El descuento no puede superar el subtotal'), { status: 400 });
  return { tipo, valor, importe, total: Number((subtotal - importe).toFixed(2)) };
}

function metodoPago(value) { return ['efectivo','transferencia','qr','tarjeta','mixto'].includes(value) ? value : 'efectivo'; }

async function cajaPedido(connection, userId, orderId, total, paid, method = 'efectivo') {
  if (paid) {
    await connection.query(`INSERT INTO movimientos_caja
      (id_usuario,tipo,categoria,concepto,monto,metodo_pago,origen,origen_id,anulado)
      VALUES(?,'ingreso','pedido',?,?,?,'pedido',?,0)
      ON DUPLICATE KEY UPDATE monto=VALUES(monto),metodo_pago=VALUES(metodo_pago),anulado=0,fecha_movimiento=NOW()`,
    [userId, `Pago de pedido #${orderId}`, total, metodoPago(method), orderId]);
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
      VALUES(?,?,'restauracion_pedido',?,?,?,'pedido',?,'Pedido cancelado o eliminado')`,
    [userId, detail.id_producto, detail.cantidad_stock_descontada, product.stock_actual, newStock, orderId]);
  }
}

async function descontarStock(connection, userId, orderId) {
  const [details] = await connection.query('SELECT * FROM pedido_detalles WHERE id_usuario=? AND id_pedido=? FOR UPDATE', [userId, orderId]);
  for (const detail of details) {
    const [[product]] = await connection.query('SELECT stock_actual FROM productos WHERE id_producto=? AND id_usuario=? FOR UPDATE', [detail.id_producto, userId]);
    if (!product) continue;
    const discount = detail.cantidad;
    const newStock = product.stock_actual - discount;
    await connection.query('UPDATE productos SET stock_actual=? WHERE id_producto=? AND id_usuario=?', [newStock, detail.id_producto, userId]);
    await connection.query('UPDATE pedido_detalles SET cantidad_stock_descontada=? WHERE id_pedido_detalle=? AND id_usuario=?', [discount, detail.id_pedido_detalle, userId]);
    await connection.query(`INSERT INTO movimientos_stock
      (id_usuario,id_producto,tipo,cantidad,stock_anterior,stock_nuevo,origen,origen_id,motivo)
      VALUES(?,?,'pedido',?,?,?,'pedido',?,'Stock reservado al crear o reactivar pedido')`,
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
  const direction = req.query.orden === 'desc' ? 'DESC' : 'ASC';
  const order = !req.query.estado && req.query.prioridad !== 'false' ? `p.estado='entregado' ASC, CASE WHEN p.estado='entregado' THEN p.fecha_entrega END DESC, CASE WHEN p.estado<>'entregado' THEN p.fecha_entrega END ASC` : `p.fecha_entrega ${direction}`;
  const [rows] = await db.query(`SELECT p.*,(SELECT GROUP_CONCAT(CONCAT(producto_nombre,' x',cantidad) SEPARATOR ', ') FROM pedido_detalles d WHERE d.id_pedido=p.id_pedido) detalle_resumido FROM pedidos p WHERE ${where} ORDER BY ${order} LIMIT 500`, args);
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
    const state = req.body.estado === 'entregado' ? 'entregado' : 'pendiente';
    const [result] = await connection.query(`INSERT INTO pedidos
      (id_usuario,id_cliente,cliente_nombre,cliente_telefono,cliente_direccion,fecha_entrega,estado,pagado,fecha_pago,metodo_pago,pago_detalle_json,total,observaciones)
      VALUES(?,?,?,?,?,?,?,?,IF(?=1,NOW(),NULL),?,?,0,?)`, [userId, client.id_cliente, client.nombre, client.telefono, client.direccion, req.body.fecha_entrega, state, req.body.pagado ? 1 : 0, req.body.pagado ? 1 : 0, metodoPago(req.body.metodo_pago), req.body.pago_detalle ? JSON.stringify(req.body.pago_detalle) : null, req.body.observaciones || null]);
    const subtotal = await crearDetalles(connection, userId, result.insertId, req.body.detalles);
    const discount = calcularDescuento(subtotal, req.body);
    await connection.query('UPDATE pedidos SET subtotal=?,descuento_tipo=?,descuento_valor=?,descuento_importe=?,total=? WHERE id_pedido=?', [subtotal, discount.tipo, discount.valor, discount.importe, discount.total, result.insertId]);
    // El stock se reserva al tomar el pedido, no recién al entregarlo.
    await descontarStock(connection, userId, result.insertId);
    await cajaPedido(connection, userId, result.insertId, discount.total, req.body.pagado, req.body.metodo_pago);
    await connection.commit(); res.status(201).json({ ok: true, mensaje: 'Pedido creado', data: { id_pedido: result.insertId, total: discount.total } });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

exports.editarPedido = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction(); const userId = req.usuario.id_usuario; const orderId = req.params.id;
    if (!fechaValida(req.body.fecha_entrega)) throw Object.assign(new Error('Fecha de entrega inválida'), { status: 400 });
    const [[old]] = await connection.query('SELECT * FROM pedidos WHERE id_pedido=? AND id_usuario=? AND activo=1 FOR UPDATE', [orderId, userId]);
    if (!old) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
    const [[client]] = await connection.query('SELECT * FROM clientes WHERE id_cliente=? AND id_usuario=? AND activo=1', [req.body.id_cliente, userId]);
    if (!client) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });
    await restaurarStock(connection, userId, orderId);
    await connection.query('DELETE FROM pedido_detalles WHERE id_pedido=? AND id_usuario=?', [orderId, userId]);
    const subtotal = await crearDetalles(connection, userId, orderId, req.body.detalles); const state = req.body.estado || 'pendiente';
    if (!['pendiente','entregado','cancelado'].includes(state)) throw Object.assign(new Error('Estado inválido'), { status: 400 });
    const discount = calcularDescuento(subtotal, req.body);
    if (state !== 'cancelado') await descontarStock(connection, userId, orderId);
    await connection.query(`UPDATE pedidos SET id_cliente=?,cliente_nombre=?,cliente_telefono=?,cliente_direccion=?,fecha_entrega=?,estado=?,pagado=?,fecha_pago=IF(?=1,COALESCE(fecha_pago,NOW()),NULL),metodo_pago=?,pago_detalle_json=?,subtotal=?,descuento_tipo=?,descuento_valor=?,descuento_importe=?,total=?,observaciones=? WHERE id_pedido=? AND id_usuario=?`, [client.id_cliente, client.nombre, client.telefono, client.direccion, req.body.fecha_entrega, state, req.body.pagado ? 1 : 0, req.body.pagado ? 1 : 0, metodoPago(req.body.metodo_pago), req.body.pago_detalle ? JSON.stringify(req.body.pago_detalle) : null, subtotal, discount.tipo, discount.valor, discount.importe, discount.total, req.body.observaciones || null, orderId, userId]);
    await cajaPedido(connection, userId, orderId, discount.total, req.body.pagado, req.body.metodo_pago);
    await connection.commit(); res.json({ ok: true, mensaje: 'Pedido actualizado', data: { total: discount.total } });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

exports.estado = async (req, res) => {
  if (!['pendiente', 'entregado', 'cancelado'].includes(req.body.estado)) return res.status(400).json({ ok: false, mensaje: 'Estado inválido' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction(); const userId = req.usuario.id_usuario; const orderId = req.params.id;
    const [[order]] = await connection.query('SELECT estado FROM pedidos WHERE id_pedido=? AND id_usuario=? AND activo=1 FOR UPDATE', [orderId, userId]);
    if (!order) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
    // Pendiente y entregado conservan la misma reserva. Cancelar la libera;
    // reactivar un pedido cancelado vuelve a reservar sus productos.
    if (order.estado === 'cancelado' && req.body.estado !== 'cancelado') await descontarStock(connection, userId, orderId);
    if (order.estado !== 'cancelado' && req.body.estado === 'cancelado') await restaurarStock(connection, userId, orderId);
    await connection.query('UPDATE pedidos SET estado=? WHERE id_pedido=? AND id_usuario=?', [req.body.estado, orderId, userId]);
    await connection.commit(); res.json({ ok: true, mensaje: 'Estado actualizado' });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

exports.pagado = async (req, res) => {
  const connection = await db.getConnection();
  try { await connection.beginTransaction(); const [[order]] = await connection.query('SELECT total,metodo_pago FROM pedidos WHERE id_pedido=? AND id_usuario=? AND activo=1 FOR UPDATE', [req.params.id, req.usuario.id_usuario]); if (!order) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 }); const paid = !!req.body.pagado,method=metodoPago(req.body.metodo_pago||order.metodo_pago); await connection.query('UPDATE pedidos SET pagado=?,metodo_pago=?,fecha_pago=IF(?=1,NOW(),NULL) WHERE id_pedido=? AND id_usuario=?', [paid,method,paid, req.params.id, req.usuario.id_usuario]); await cajaPedido(connection, req.usuario.id_usuario, req.params.id, order.total, paid,method); await connection.commit(); res.json({ ok: true, mensaje: 'Pago actualizado' }); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

exports.eliminarPedido = async (req, res) => {
  const connection = await db.getConnection();
  try { await connection.beginTransaction(); const [[order]] = await connection.query('SELECT id_pedido FROM pedidos WHERE id_pedido=? AND id_usuario=? AND activo=1 FOR UPDATE', [req.params.id, req.usuario.id_usuario]); if (!order) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 }); await restaurarStock(connection, req.usuario.id_usuario, order.id_pedido); await connection.query('UPDATE pedidos SET activo=0 WHERE id_pedido=? AND id_usuario=?', [order.id_pedido, req.usuario.id_usuario]); await cajaPedido(connection, req.usuario.id_usuario, order.id_pedido, 0, false); await connection.commit(); res.json({ ok: true, mensaje: 'Pedido eliminado' }); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

exports.stock = async (req, res) => { const [rows] = await db.query('SELECT id_producto,nombre,categoria,stock_actual FROM productos WHERE id_usuario=? AND activo=1 ORDER BY nombre', [req.usuario.id_usuario]); res.json({ ok: true, data: rows }); };
exports.moverStock = async (req, res) => {
  const requested = entero(Number(req.body.cantidad));
  const exact = req.body.tipo === 'establecer';
  if ((!exact && !['agregar', 'quitar'].includes(req.body.tipo)) || requested === null || (exact ? !Number.isInteger(requested) : requested < 1)) {
    return res.status(400).json({ ok: false, mensaje: 'Movimiento inválido' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[product]] = await connection.query(
      'SELECT stock_actual FROM productos WHERE id_producto=? AND id_usuario=? AND activo=1 FOR UPDATE',
      [req.params.id, req.usuario.id_usuario]
    );
    if (!product) throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
    const previous = Number(product.stock_actual);
    const newStock = exact ? requested : req.body.tipo === 'agregar' ? previous + requested : previous - requested;
    const movementType = newStock >= previous ? 'agregar' : 'quitar';
    const movementQuantity = Math.abs(newStock - previous);
    if (!movementQuantity) {
      await connection.commit();
      return res.json({ ok: true, mensaje: 'El stock ya tenía ese valor', data: { stock_actual: newStock } });
    }
    await connection.query('UPDATE productos SET stock_actual=? WHERE id_producto=? AND id_usuario=?', [newStock, req.params.id, req.usuario.id_usuario]);
    await connection.query(
      'INSERT INTO movimientos_stock(id_usuario,id_producto,tipo,cantidad,stock_anterior,stock_nuevo,origen,motivo) VALUES(?,?,?,?,?,?,?,?)',
      [req.usuario.id_usuario, req.params.id, movementType, movementQuantity, previous, newStock, 'manual', req.body.motivo || (exact ? `Stock establecido en ${newStock}` : null)]
    );
    await connection.commit();
    res.json({ ok: true, mensaje: 'Stock actualizado', data: { stock_actual: newStock } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.crearCompra = async (req, res) => { if (!fechaValida(req.body.fecha_compra)) return res.status(400).json({ ok: false, mensaje: 'Fecha de compra inválida' }); if (!Array.isArray(req.body.detalles) || !req.body.detalles.length) return res.status(400).json({ ok: false, mensaje: 'Agrega al menos un insumo' }); const connection = await db.getConnection(); try { await connection.beginTransaction(); let subtotalCompra = 0; const items = []; for (const detail of req.body.detalles) { const quantity = numero(detail.cantidad); const price = numero(detail.precio_unitario); if (!quantity || quantity <= 0 || price === null || price < 0) throw Object.assign(new Error('Detalle de compra inválido'), { status: 400 }); const [[supply]] = await connection.query('SELECT id_insumo,nombre FROM insumos WHERE id_insumo=? AND id_usuario=? AND activo=1', [detail.id_insumo, req.usuario.id_usuario]); if (!supply) throw Object.assign(new Error('Insumo no encontrado'), { status: 404 }); const subtotal = Number((quantity * price).toFixed(2)); subtotalCompra += subtotal; items.push({ ...supply, quantity, price, subtotal }); } subtotalCompra = Number(subtotalCompra.toFixed(2)); const discount = calcularDescuento(subtotalCompra, req.body),method=metodoPago(req.body.metodo_pago); const provider = String(req.body.proveedor || '').trim() || 'Sin especificar'; const [result] = await connection.query('INSERT INTO compras(id_usuario,proveedor,fecha_compra,subtotal,descuento_tipo,descuento_valor,descuento_importe,total,metodo_pago,observaciones) VALUES(?,?,?,?,?,?,?,?,?,?)', [req.usuario.id_usuario, provider, req.body.fecha_compra, subtotalCompra, discount.tipo, discount.valor, discount.importe, discount.total,method, req.body.observaciones || null]); for (const item of items) await connection.query('INSERT INTO compra_detalles(id_usuario,id_compra,id_insumo,insumo_nombre,cantidad,precio_unitario,subtotal) VALUES(?,?,?,?,?,?,?)', [req.usuario.id_usuario, result.insertId, item.id_insumo, item.nombre, item.quantity, item.price, item.subtotal]); await connection.query("INSERT INTO movimientos_caja(id_usuario,tipo,categoria,concepto,monto,metodo_pago,origen,origen_id,fecha_movimiento) VALUES(?,'egreso','compra',?,?,?,'compra',?,?)", [req.usuario.id_usuario, `Compra #${result.insertId}`, discount.total,method, result.insertId, `${req.body.fecha_compra} 12:00:00`]); await connection.commit(); res.status(201).json({ ok: true, mensaje: 'Compra registrada', data: { id_compra: result.insertId, total: discount.total } }); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } };
exports.compras = async (req, res) => { const [rows] = await db.query('SELECT * FROM compras WHERE id_usuario=? AND activo=1 ORDER BY fecha_compra DESC,id_compra DESC', [req.usuario.id_usuario]); res.json({ ok: true, data: rows }); };
exports.compra = async (req, res) => { const [[purchase]] = await db.query('SELECT * FROM compras WHERE id_compra=? AND id_usuario=? AND activo=1', [req.params.id, req.usuario.id_usuario]); if (!purchase) return res.status(404).json({ ok: false, mensaje: 'Compra no encontrada' }); const [details] = await db.query('SELECT * FROM compra_detalles WHERE id_compra=? AND id_usuario=?', [purchase.id_compra, req.usuario.id_usuario]); res.json({ ok: true, data: { ...purchase, detalles: details } }); };
exports.caja = async (req, res) => { let where = 'm.id_usuario=?'; const args = [req.usuario.id_usuario]; if (req.query.tipo) { where += ' AND m.tipo=?'; args.push(req.query.tipo); } const [rows] = await db.query(`SELECT m.*, CASE WHEN m.origen='compra' THEN c.proveedor WHEN m.origen='pedido' THEN p.cliente_nombre ELSE NULL END AS contraparte FROM movimientos_caja m LEFT JOIN compras c ON m.origen='compra' AND c.id_compra=m.origen_id AND c.id_usuario=m.id_usuario LEFT JOIN pedidos p ON m.origen='pedido' AND p.id_pedido=m.origen_id AND p.id_usuario=m.id_usuario WHERE ${where} ORDER BY m.fecha_movimiento ${req.query.orden === 'asc' ? 'ASC' : 'DESC'}`, args); res.json({ ok: true, data: rows }); };
exports.resumen = async (req, res) => { const [[summary]] = await db.query("SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' AND anulado=0 THEN monto ELSE 0 END),0) ingresos,COALESCE(SUM(CASE WHEN tipo='egreso' AND anulado=0 THEN monto ELSE 0 END),0) egresos FROM movimientos_caja WHERE id_usuario=?", [req.usuario.id_usuario]); summary.balance = summary.ingresos - summary.egresos; res.json({ ok: true, data: summary }); };
exports.dashboard = async (req, res) => {
  const userId = req.usuario.id_usuario;
  const [userResult, ordersResult, salesResult, cashResult, pendingResult, todayResult, overdueResult, stockResult] = await Promise.all([
    db.query('SELECT nombre FROM usuarios WHERE id_usuario=?', [userId]),
    db.query("SELECT id_pedido,cliente_nombre,fecha_entrega,total,estado,pagado FROM pedidos WHERE id_usuario=? AND activo=1 AND fecha_entrega>=CURDATE() AND estado<>'cancelado' ORDER BY estado='entregado',fecha_entrega LIMIT 10", [userId]),
    db.query("SELECT COALESCE(SUM(total),0) total,COUNT(*) cantidad FROM pedidos WHERE id_usuario=? AND activo=1 AND estado<>'cancelado' AND DATE(fecha_pedido)=CURDATE()", [userId]),
    db.query("SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' AND anulado=0 THEN monto WHEN tipo='egreso' AND anulado=0 THEN -monto ELSE 0 END),0) balance FROM movimientos_caja WHERE id_usuario=?", [userId]),
    db.query("SELECT COUNT(*) cantidad FROM pedidos WHERE id_usuario=? AND activo=1 AND estado='pendiente'", [userId]),
    db.query("SELECT COUNT(*) cantidad FROM pedidos WHERE id_usuario=? AND activo=1 AND estado='pendiente' AND fecha_entrega=CURDATE()", [userId]),
    db.query("SELECT COUNT(*) cantidad FROM pedidos WHERE id_usuario=? AND activo=1 AND estado='pendiente' AND fecha_entrega<CURDATE()", [userId]),
    db.query('SELECT id_producto,nombre,stock_actual,stock_minimo FROM productos WHERE id_usuario=? AND activo=1 AND stock_actual<=stock_minimo ORDER BY stock_actual,nombre LIMIT 6', [userId]),
  ]);
  res.json({
    ok: true,
    data: {
      usuario: userResult[0][0] || null,
      pedidos_proximos: ordersResult[0],
      resumen: {
        ventas_hoy: Number(salesResult[0][0].total),
        operaciones_hoy: Number(salesResult[0][0].cantidad),
        balance_caja: Number(cashResult[0][0].balance),
        pedidos_pendientes: Number(pendingResult[0][0].cantidad),
        entregas_hoy: Number(todayResult[0][0].cantidad),
      },
      alertas: {
        pedidos_atrasados: Number(overdueResult[0][0].cantidad),
        stock_bajo: stockResult[0],
      },
    },
  });
};

exports.listarCostos = async (req, res) => {
  const search = String(req.query.search || '').trim();
  const [rows] = await db.query(`SELECT id_costo_producto,nombre,costo_total,detalle_json,fecha_creacion
    FROM costos_productos WHERE id_usuario=? AND activo=1 AND nombre LIKE ?
    ORDER BY fecha_creacion DESC LIMIT 100`, [req.usuario.id_usuario, `%${search}%`]);
  res.json({ ok: true, data: rows.map(row => ({ ...row, detalle_json: typeof row.detalle_json === 'string' ? JSON.parse(row.detalle_json) : row.detalle_json })) });
};

exports.guardarCosto = async (req, res) => {
  const name = String(req.body.nombre || '').trim();
  const total = numero(req.body.costo_total);
  const details = Array.isArray(req.body.detalles) ? req.body.detalles.slice(0, 100) : [];
  if (!name || name.length > 150 || total === null || total < 0) return res.status(400).json({ ok: false, mensaje: 'Nombre o costo inválido' });
  const [result] = await db.query('INSERT INTO costos_productos(id_usuario,nombre,costo_total,detalle_json) VALUES(?,?,?,?)', [req.usuario.id_usuario, name, total, JSON.stringify(details)]);
  res.status(201).json({ ok: true, mensaje: 'Costo guardado correctamente', data: { id_costo_producto: result.insertId } });
};

exports.editarCosto = async (req, res) => {
  const name = String(req.body.nombre || '').trim();
  const total = numero(req.body.costo_total);
  const details = Array.isArray(req.body.detalles) ? req.body.detalles.slice(0, 100) : [];
  if (!name || name.length > 150 || total === null || total < 0) return res.status(400).json({ ok: false, mensaje: 'Nombre o costo inválido' });
  const [result] = await db.query('UPDATE costos_productos SET nombre=?,costo_total=?,detalle_json=? WHERE id_costo_producto=? AND id_usuario=? AND activo=1', [name, total, JSON.stringify(details), req.params.id, req.usuario.id_usuario]);
  if (!result.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Costo no encontrado' });
  res.json({ ok: true, mensaje: 'Costo actualizado' });
};

exports.eliminarCosto = async (req, res) => {
  const [result] = await db.query('UPDATE costos_productos SET activo=0 WHERE id_costo_producto=? AND id_usuario=? AND activo=1', [req.params.id, req.usuario.id_usuario]);
  if (!result.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Costo no encontrado' });
  res.json({ ok: true, mensaje: 'Costo eliminado' });
};

exports.movimientoCapital = async (req, res) => {
  const type = req.body.tipo;
  const amount = numero(req.body.monto);
  const description = String(req.body.descripcion || '').trim();
  if (!['ingreso', 'egreso'].includes(type) || amount === null || amount <= 0 || !description || description.length > 255) {
    return res.status(400).json({ ok: false, mensaje: 'Completa un monto válido y una descripción' });
  }
  const concept = type === 'ingreso' ? `Aporte: ${description}` : `Retiro: ${description}`;
  const [result] = await db.query(`INSERT INTO movimientos_caja
    (id_usuario,tipo,categoria,concepto,monto,origen,origen_id,observaciones)
    VALUES(?,?,'capital',?,?,'manual',NULL,?)`, [req.usuario.id_usuario, type, concept, amount, description]);
  res.status(201).json({ ok: true, mensaje: type === 'ingreso' ? 'Aporte registrado' : 'Retiro registrado', data: { id_movimiento_caja: result.insertId } });
};

exports.categorias = async (req, res) => { const [rows] = await db.query('SELECT id_categoria,nombre FROM categorias_productos WHERE id_usuario=? AND activo=1 ORDER BY nombre', [req.usuario.id_usuario]); res.json({ ok: true, data: rows }); };
exports.crearCategoria = async (req, res) => { const nombre = String(req.body.nombre || '').trim(); if (!nombre || nombre.length > 80) return res.status(400).json({ ok: false, mensaje: 'Nombre de categoría inválido' }); try { const [result] = await db.query('INSERT INTO categorias_productos(id_usuario,nombre) VALUES(?,?)', [req.usuario.id_usuario, nombre]); res.status(201).json({ ok: true, mensaje: 'Categoría creada', data: { id_categoria: result.insertId, nombre } }); } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, mensaje: 'Esa categoría ya existe' }); throw error; } };
exports.desactivarCategoria = async (req, res) => { const [[category]] = await db.query('SELECT nombre FROM categorias_productos WHERE id_categoria=? AND id_usuario=? AND activo=1', [req.params.id, req.usuario.id_usuario]); if (!category) return res.status(404).json({ ok: false, mensaje: 'Categoría no encontrada' }); const [[usage]] = await db.query('SELECT COUNT(*) cantidad FROM productos WHERE id_usuario=? AND activo=1 AND categoria=?', [req.usuario.id_usuario, category.nombre]); if (usage.cantidad) return res.status(409).json({ ok: false, mensaje: 'La categoría tiene productos activos' }); await db.query('UPDATE categorias_productos SET activo=0 WHERE id_categoria=? AND id_usuario=?', [req.params.id, req.usuario.id_usuario]); res.json({ ok: true, mensaje: 'Categoría desactivada' }); };

function filtrosFecha(req, field, args) { let sql = ''; if (req.query.desde && fechaValida(req.query.desde)) { sql += ` AND ${field}>=?`; args.push(req.query.desde); } if (req.query.hasta && fechaValida(req.query.hasta)) { sql += ` AND ${field}<=?`; args.push(req.query.hasta); } return sql; }
exports.informes = async (req, res) => {
  const userId = req.usuario.id_usuario, text = `%${String(req.query.buscar || '').trim()}%`;
  const orderArgs = [userId]; let orderWhere = filtrosFecha(req, 'p.fecha_entrega', orderArgs);
  if (req.query.estado) { orderWhere += ' AND p.estado=?'; orderArgs.push(req.query.estado); }
  if (['true','false'].includes(req.query.pagado)) { orderWhere += ' AND p.pagado=?'; orderArgs.push(req.query.pagado === 'true' ? 1 : 0); }
  if (req.query.buscar) { orderWhere += ' AND (p.cliente_nombre LIKE ? OR EXISTS(SELECT 1 FROM pedido_detalles pd2 WHERE pd2.id_pedido=p.id_pedido AND pd2.producto_nombre LIKE ?))'; orderArgs.push(text, text); }
  const [orders] = await db.query(`SELECT p.*,GROUP_CONCAT(CONCAT(pd.producto_nombre,' x',pd.cantidad) SEPARATOR ', ') detalle FROM pedidos p LEFT JOIN pedido_detalles pd ON pd.id_pedido=p.id_pedido WHERE p.id_usuario=? AND p.activo=1 ${orderWhere} GROUP BY p.id_pedido ORDER BY p.fecha_entrega DESC LIMIT 1000`, orderArgs);
  const purchaseArgs = [userId]; let purchaseWhere = filtrosFecha(req, 'c.fecha_compra', purchaseArgs);
  if (req.query.buscar) { purchaseWhere += ' AND (c.proveedor LIKE ? OR EXISTS(SELECT 1 FROM compra_detalles cd2 WHERE cd2.id_compra=c.id_compra AND cd2.insumo_nombre LIKE ?))'; purchaseArgs.push(text, text); }
  const [purchases] = await db.query(`SELECT c.*,GROUP_CONCAT(CONCAT(cd.insumo_nombre,' x',cd.cantidad) SEPARATOR ', ') detalle FROM compras c LEFT JOIN compra_detalles cd ON cd.id_compra=c.id_compra WHERE c.id_usuario=? AND c.activo=1 ${purchaseWhere} GROUP BY c.id_compra ORDER BY c.fecha_compra DESC LIMIT 1000`, purchaseArgs);
  const orderIds = orders.map(item => item.id_pedido), purchaseIds = purchases.map(item => item.id_compra);
  let orderDetails = [], purchaseDetails = [];
  if (orderIds.length) [orderDetails] = await db.query(`SELECT id_pedido,producto_nombre,precio_unitario,cantidad,subtotal FROM pedido_detalles WHERE id_usuario=? AND id_pedido IN (${orderIds.map(() => '?').join(',')}) ORDER BY id_pedido,id_pedido_detalle`, [userId, ...orderIds]);
  if (purchaseIds.length) [purchaseDetails] = await db.query(`SELECT id_compra,insumo_nombre,precio_unitario,cantidad,subtotal FROM compra_detalles WHERE id_usuario=? AND id_compra IN (${purchaseIds.map(() => '?').join(',')}) ORDER BY id_compra,id_compra_detalle`, [userId, ...purchaseIds]);
  const detailedOrders = orders.map(order => ({ ...order, items: orderDetails.filter(detail => detail.id_pedido === order.id_pedido) }));
  const detailedPurchases = purchases.map(purchase => ({ ...purchase, items: purchaseDetails.filter(detail => detail.id_compra === purchase.id_compra) }));
  const [topProducts] = await db.query(`SELECT pd.producto_nombre nombre,SUM(pd.cantidad) cantidad,SUM(pd.subtotal) importe FROM pedido_detalles pd JOIN pedidos p ON p.id_pedido=pd.id_pedido WHERE p.id_usuario=? AND p.activo=1 AND p.estado='entregado' GROUP BY pd.producto_nombre ORDER BY cantidad DESC LIMIT 5`, [userId]);
  const [topSupplies] = await db.query(`SELECT cd.insumo_nombre nombre,SUM(cd.cantidad) cantidad,SUM(cd.subtotal) importe FROM compra_detalles cd JOIN compras c ON c.id_compra=cd.id_compra WHERE c.id_usuario=? AND c.activo=1 GROUP BY cd.insumo_nombre ORDER BY cantidad DESC LIMIT 5`, [userId]);
  const ventas = orders.filter(item => item.estado === 'entregado').reduce((sum, item) => sum + Number(item.total), 0), compras = purchases.reduce((sum, item) => sum + Number(item.total), 0);
  const [[capital]] = await db.query("SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END),0) total FROM movimientos_caja WHERE id_usuario=? AND categoria='capital' AND anulado=0", [userId]);
  res.json({ ok: true, data: { pedidos: detailedOrders, compras: detailedPurchases, top_productos: topProducts, top_insumos: topSupplies, resumen: { ventas, compras, capital: Number(capital.total) } } });
};
