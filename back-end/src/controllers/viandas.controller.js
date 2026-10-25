const { randomUUID } = require("node:crypto");
const db = require("../config/db");
const { numero, entero } = require("../utils/numeros");
const { fechaValida } = require("../utils/fechas");

const PAYMENT_METHODS = ["efectivo", "transferencia", "qr", "tarjeta", "mixto"];
const FREQUENCIES = ["unico", "diario", "semanal", "mensual"];
const STATES = ["pendiente", "entregado", "cancelado"];
const WEEKDAYS = [1, 2, 3, 4, 5];

const paymentMethod = (value) =>
  PAYMENT_METHODS.includes(value) ? value : "efectivo";
const booleanValue = (value) => value === true || value === 1 || value === "1";
const dateText = (date) => date.toISOString().slice(0, 10);
const round = (value) => Number(Number(value || 0).toFixed(2));

function calculateDiscount(subtotal, body) {
  const type = body.descuento_tipo || null;
  const value = numero(body.descuento_valor || 0) || 0;
  if (!type || value === 0)
    return { type: null, value: 0, amount: 0, total: subtotal };
  if (
    !["porcentaje", "fijo"].includes(type) ||
    value < 0 ||
    (type === "porcentaje" && value > 100)
  )
    throw Object.assign(new Error("Descuento inválido"), { status: 400 });
  const amount = round(type === "porcentaje" ? (subtotal * value) / 100 : value);
  if (amount > subtotal)
    throw Object.assign(new Error("El descuento no puede superar el subtotal"), {
      status: 400,
    });
  return { type, value, amount, total: round(subtotal - amount) };
}

function selectedWeekdays(frequency, weekDays, start) {
  const selected = new Set(
    (Array.isArray(weekDays) ? weekDays : [])
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );
  if (frequency === "semanal" && !selected.size) selected.add(start.getUTCDay());
  if (["diario", "mensual"].includes(frequency) && !selected.size)
    WEEKDAYS.forEach((day) => selected.add(day));
  return selected;
}

function deliveryDates(startText, endText, frequency, weekDays) {
  if (!fechaValida(startText))
    throw Object.assign(new Error("Fecha inicial inválida"), { status: 400 });
  const normalizedFrequency = FREQUENCIES.includes(frequency) ? frequency : "unico";
  const finalText = normalizedFrequency === "unico" ? startText : endText;
  if (!fechaValida(finalText))
    throw Object.assign(new Error("Fecha final inválida"), { status: 400 });
  const start = new Date(`${startText}T12:00:00Z`);
  const end = new Date(`${finalText}T12:00:00Z`);
  if (end < start)
    throw Object.assign(new Error("La fecha final no puede ser anterior a la inicial"), {
      status: 400,
    });
  if ((end - start) / 86400000 > 730)
    throw Object.assign(new Error("El plan no puede superar dos años"), {
      status: 400,
    });
  if (normalizedFrequency === "unico") return [startText];
  const selected = selectedWeekdays(normalizedFrequency, weekDays, start);
  const dates = [];
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    if (selected.has(cursor.getUTCDay())) dates.push(dateText(cursor));
  }
  if (!dates.length)
    throw Object.assign(new Error("La recurrencia no genera ninguna entrega"), {
      status: 400,
    });
  if (dates.length > 520)
    throw Object.assign(new Error("El plan genera demasiadas entregas; acorta el rango"), {
      status: 400,
    });
  return dates;
}

async function ensureConfiguration(connection, userId) {
  await connection.query(
    "INSERT IGNORE INTO configuraciones_viandas(id_usuario) VALUES(?)",
    [userId],
  );
  await connection.query(
    "INSERT IGNORE INTO tipos_vianda(id_usuario,nombre,precio_base) VALUES(?,'Vianda',0),(?,'Vianda reforzada',0)",
    [userId, userId],
  );
}

async function orderValues(connection, userId, body) {
  const [[client]] = await connection.query(
    "SELECT * FROM clientes WHERE id_cliente=? AND id_usuario=? AND activo=1",
    [body.id_cliente, userId],
  );
  if (!client)
    throw Object.assign(new Error("Cliente no encontrado"), { status: 404 });
  const requested = Array.isArray(body.items) && body.items.length
    ? body.items
    : [{
        id_tipo_vianda: body.id_tipo_vianda,
        cantidad: body.cantidad,
        precio_unitario: body.precio_unitario,
        con_postre: body.con_postre,
        precio_postre_unitario: body.precio_postre_unitario,
      }];
  if (requested.length > 20)
    throw Object.assign(new Error("Una entrega admite hasta 20 renglones"), {
      status: 400,
    });
  const ids = [...new Set(requested.map((item) => Number(item.id_tipo_vianda)).filter(Boolean))];
  if (!ids.length)
    throw Object.assign(new Error("Agrega al menos un tipo de vianda"), {
      status: 400,
    });
  const [types] = await connection.query(
    `SELECT id_tipo_vianda,nombre,precio_base FROM tipos_vianda
     WHERE id_usuario=? AND activo=1 AND id_tipo_vianda IN (${ids.map(() => "?").join(",")})`,
    [userId, ...ids],
  );
  const typeMap = new Map(types.map((item) => [Number(item.id_tipo_vianda), item]));
  const items = requested.map((raw) => {
    const type = typeMap.get(Number(raw.id_tipo_vianda));
    if (!type)
      throw Object.assign(new Error("Tipo de vianda no encontrado"), { status: 404 });
    const quantity = entero(Number(raw.cantidad));
    const unitPrice = numero(raw.precio_unitario ?? type.precio_base);
    const dessert = booleanValue(raw.con_postre);
    const dessertPrice = dessert ? numero(raw.precio_postre_unitario || 0) : 0;
    if (
      !quantity || quantity < 1 || quantity > 999 ||
      unitPrice === null || unitPrice < 0 ||
      dessertPrice === null || dessertPrice < 0
    )
      throw Object.assign(new Error("Cantidad o importes inválidos"), {
        status: 400,
      });
    return {
      idType: Number(type.id_tipo_vianda),
      typeName: type.nombre,
      quantity,
      unitPrice,
      dessert,
      dessertPrice,
      subtotal: round((unitPrice + dessertPrice) * quantity),
    };
  });
  const shipping = booleanValue(body.con_envio);
  const shippingPrice = shipping ? numero(body.costo_envio || 0) : 0;
  if (shippingPrice === null || shippingPrice < 0)
    throw Object.assign(new Error("Costo de envío inválido"), { status: 400 });
  const subtotal = round(items.reduce((sum, item) => sum + item.subtotal, 0) + shippingPrice);
  const discount = calculateDiscount(subtotal, body);
  return { client, items, shipping, shippingPrice, subtotal, discount };
}

function headerFor(items) {
  return {
    idType: items[0].idType,
    typeName: items.map((item) => `${item.typeName} x${item.quantity}`).join(" + ").slice(0, 100),
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    unitPrice: items[0].unitPrice,
    dessert: items.some((item) => item.dessert),
    dessertPrice: items.reduce((sum, item) => Math.max(sum, item.dessertPrice), 0),
  };
}

async function insertDetails(connection, userId, orderId, items) {
  for (const item of items) {
    await connection.query(
      `INSERT INTO pedido_vianda_detalles
       (id_usuario,id_pedido_vianda,id_tipo_vianda,tipo_nombre,cantidad,precio_unitario,con_postre,precio_postre_unitario,subtotal)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [userId, orderId, item.idType, item.typeName, item.quantity, item.unitPrice,
        item.dessert ? 1 : 0, item.dessertPrice, item.subtotal],
    );
  }
}

async function insertPayment(
  connection,
  userId,
  seriesId,
  amountValue,
  methodValue,
  date,
  notes,
  orderId = null,
) {
  const amount = numero(amountValue);
  if (amount === null || amount <= 0)
    throw Object.assign(new Error("El pago debe ser mayor que cero"), { status: 400 });
  const [[series]] = await connection.query(
    `SELECT id_serie,cliente_nombre,total_plan,monto_pagado FROM series_viandas
     WHERE id_serie=? AND id_usuario=? AND activo=1 FOR UPDATE`,
    [seriesId, userId],
  );
  if (!series)
    throw Object.assign(new Error("Reserva de viandas no encontrada"), { status: 404 });
  let delivery = null;
  if (orderId) {
    [[delivery]] = await connection.query(
      `SELECT id_pedido_vianda,total,pagado FROM pedidos_viandas
       WHERE id_pedido_vianda=? AND id_serie=? AND id_usuario=? AND activo=1 FOR UPDATE`,
      [orderId, seriesId, userId],
    );
    if (!delivery)
      throw Object.assign(new Error("Entrega de vianda no encontrada"), { status: 404 });
    const [[previous]] = await connection.query(
      `SELECT id_pago_vianda FROM pagos_viandas
       WHERE id_usuario=? AND id_pedido_vianda=? AND activo=1`,
      [userId, orderId],
    );
    if (previous)
      throw Object.assign(new Error("El pago de esta entrega ya fue registrado"), {
        status: 409,
      });
  }
  const remaining = round(Number(series.total_plan) - Number(series.monto_pagado));
  if (amount > remaining + 0.005)
    throw Object.assign(new Error(`El pago supera el saldo pendiente de $${remaining.toFixed(2)}`), {
      status: 400,
    });
  const method = paymentMethod(methodValue);
  const paymentDate = fechaValida(date) ? `${date} 12:00:00` : null;
  const [result] = await connection.query(
    `INSERT INTO pagos_viandas(id_usuario,id_serie,id_pedido_vianda,monto,metodo_pago,fecha_pago,observaciones)
     VALUES(?,?,?,?,?,COALESCE(?,NOW()),?)`,
    [userId, seriesId, orderId, amount, method, paymentDate, String(notes || "").trim() || null],
  );
  await connection.query(
    `INSERT INTO movimientos_caja
     (id_usuario,tipo,categoria,concepto,monto,metodo_pago,origen,origen_id,anulado,fecha_movimiento,observaciones)
     VALUES(?,'ingreso','pedido',?,?,?,'vianda',?,0,COALESCE(?,NOW()),?)`,
    [userId, `${orderId ? "Pago de entrega" : "Pago de viandas"} · ${series.cliente_nombre || "Cliente"}`, amount,
      method, result.insertId, paymentDate, `Reserva ${seriesId}`],
  );
  const newPaid = round(Number(series.monto_pagado) + amount);
  const completed = newPaid + 0.005 >= Number(series.total_plan);
  await connection.query(
    `UPDATE series_viandas SET monto_pagado=?,pagado=?,metodo_pago=?
     WHERE id_serie=? AND id_usuario=?`,
    [newPaid, completed ? 1 : 0, method, seriesId, userId],
  );
  if (completed) {
    await connection.query(
      `UPDATE pedidos_viandas SET pagado=1,metodo_pago=?,fecha_pago=COALESCE(fecha_pago,NOW())
       WHERE id_serie=? AND id_usuario=? AND activo=1`,
      [method, seriesId, userId],
    );
  } else if (delivery && amount + 0.005 >= Number(delivery.total)) {
    await connection.query(
      `UPDATE pedidos_viandas SET pagado=1,metodo_pago=?,fecha_pago=COALESCE(fecha_pago,NOW())
       WHERE id_pedido_vianda=? AND id_usuario=?`,
      [method, orderId, userId],
    );
  }
  return { id_pago_vianda: result.insertId, monto: amount, metodo_pago: method, pagado: completed };
}

async function detailsForOrders(connection, userId, orderIds) {
  if (!orderIds.length) return [];
  const [details] = await connection.query(
    `SELECT * FROM pedido_vianda_detalles
     WHERE id_usuario=? AND id_pedido_vianda IN (${orderIds.map(() => "?").join(",")})
     ORDER BY id_pedido_vianda,id_pedido_vianda_detalle`,
    [userId, ...orderIds],
  );
  return details;
}

exports.config = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await ensureConfiguration(connection, req.usuario.id_usuario);
    const [[settings]] = await connection.query(
      "SELECT precio_postre,precio_envio FROM configuraciones_viandas WHERE id_usuario=?",
      [req.usuario.id_usuario],
    );
    const [types] = await connection.query(
      "SELECT id_tipo_vianda,nombre,precio_base FROM tipos_vianda WHERE id_usuario=? AND activo=1 ORDER BY nombre",
      [req.usuario.id_usuario],
    );
    res.json({ ok: true, data: { ...settings, tipos: types } });
  } finally {
    connection.release();
  }
};

exports.saveConfig = async (req, res) => {
  const dessert = numero(req.body.precio_postre);
  const shipping = numero(req.body.precio_envio);
  if (dessert === null || dessert < 0 || shipping === null || shipping < 0)
    return res.status(400).json({
      ok: false,
      mensaje: "Los importes deben ser iguales o mayores que cero",
    });
  await db.query(
    `INSERT INTO configuraciones_viandas(id_usuario,precio_postre,precio_envio) VALUES(?,?,?)
     ON DUPLICATE KEY UPDATE precio_postre=VALUES(precio_postre),precio_envio=VALUES(precio_envio)`,
    [req.usuario.id_usuario, dessert, shipping],
  );
  res.json({ ok: true, mensaje: "Configuración de viandas actualizada" });
};

exports.createType = async (req, res) => {
  const name = String(req.body.nombre || "").trim();
  const price = numero(req.body.precio_base);
  if (!name || name.length > 100 || price === null || price < 0)
    return res.status(400).json({ ok: false, mensaje: "Nombre o precio inválido" });
  try {
    const [result] = await db.query(
      "INSERT INTO tipos_vianda(id_usuario,nombre,precio_base) VALUES(?,?,?)",
      [req.usuario.id_usuario, name, price],
    );
    res.status(201).json({
      ok: true,
      data: { id_tipo_vianda: result.insertId, nombre: name, precio_base: price },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res.status(409).json({ ok: false, mensaje: "Ese tipo de vianda ya existe" });
    throw error;
  }
};

exports.updateType = async (req, res) => {
  const name = String(req.body.nombre || "").trim();
  const price = numero(req.body.precio_base);
  if (!name || name.length > 100 || price === null || price < 0)
    return res.status(400).json({ ok: false, mensaje: "Nombre o precio inválido" });
  const [result] = await db.query(
    "UPDATE tipos_vianda SET nombre=?,precio_base=? WHERE id_tipo_vianda=? AND id_usuario=? AND activo=1",
    [name, price, req.params.id, req.usuario.id_usuario],
  );
  if (!result.affectedRows)
    return res.status(404).json({ ok: false, mensaje: "Tipo de vianda no encontrado" });
  res.json({ ok: true, mensaje: "Tipo de vianda actualizado" });
};

exports.removeType = async (req, res) => {
  const [[usage]] = await db.query(
    `SELECT COUNT(*) cantidad FROM pedido_vianda_detalles d
     JOIN pedidos_viandas v ON v.id_pedido_vianda=d.id_pedido_vianda
     WHERE d.id_tipo_vianda=? AND d.id_usuario=? AND v.activo=1`,
    [req.params.id, req.usuario.id_usuario],
  );
  if (Number(usage.cantidad))
    return res.status(409).json({
      ok: false,
      mensaje: "Ese tipo tiene pedidos de viandas asociados",
    });
  const [result] = await db.query(
    "UPDATE tipos_vianda SET activo=0 WHERE id_tipo_vianda=? AND id_usuario=? AND activo=1",
    [req.params.id, req.usuario.id_usuario],
  );
  if (!result.affectedRows)
    return res.status(404).json({ ok: false, mensaje: "Tipo de vianda no encontrado" });
  res.json({ ok: true, mensaje: "Tipo de vianda eliminado" });
};

exports.list = async (req, res) => {
  const userId = req.usuario.id_usuario;
  const args = [userId];
  let where = "v.id_usuario=? AND v.activo=1";
  if (STATES.includes(req.query.estado)) {
    where += " AND v.estado=?";
    args.push(req.query.estado);
  }
  if (["true", "false"].includes(req.query.pagado)) {
    where += " AND s.pagado=?";
    args.push(req.query.pagado === "true" ? 1 : 0);
  }
  if (req.query.desde && fechaValida(req.query.desde)) {
    where += " AND v.fecha_entrega>=?";
    args.push(req.query.desde);
  }
  if (req.query.hasta && fechaValida(req.query.hasta)) {
    where += " AND v.fecha_entrega<=?";
    args.push(req.query.hasta);
  }
  if (req.query.buscar) {
    const term = `%${String(req.query.buscar).trim()}%`;
    where += " AND (v.cliente_nombre LIKE ? OR v.tipo_nombre LIKE ? OR v.cliente_direccion LIKE ?)";
    args.push(term, term, term);
  }
  const page = Math.max(entero(Number(req.query.page)) || 1, 1);
  const limit = Math.min(Math.max(entero(Number(req.query.limit)) || 8, 1), 100);
  const [[count]] = await db.query(
    `SELECT COUNT(*) total FROM pedidos_viandas v
     JOIN series_viandas s ON s.id_serie=v.id_serie AND s.id_usuario=v.id_usuario
     WHERE ${where}`,
    args,
  );
  const [rows] = await db.query(
    `SELECT v.*,s.frecuencia,s.total_plan,s.monto_pagado,s.pagado AS plan_pagado,
      c.latitud,c.longitud,c.google_place_id,
      (c.latitud IS NOT NULL AND c.longitud IS NOT NULL) tiene_ubicacion
     FROM pedidos_viandas v
     JOIN series_viandas s ON s.id_serie=v.id_serie AND s.id_usuario=v.id_usuario
     LEFT JOIN clientes c ON c.id_cliente=v.id_cliente AND c.id_usuario=v.id_usuario
     WHERE ${where}
     ORDER BY v.estado='pendiente' DESC,v.fecha_entrega ASC,v.hora_entrega ASC,v.id_pedido_vianda ASC
     LIMIT ? OFFSET ?`,
    [...args, limit, (page - 1) * limit],
  );
  const details = await detailsForOrders(db, userId, rows.map((row) => row.id_pedido_vianda));
  res.json({
    ok: true,
    data: rows.map((row) => ({
      ...row,
      items: details.filter((detail) => detail.id_pedido_vianda === row.id_pedido_vianda),
    })),
    meta: { page, limit, total: Number(count.total), total_pages: Math.max(1, Math.ceil(Number(count.total) / limit)) },
  });
};

exports.clients = async (req, res) => {
  const userId = req.usuario.id_usuario;
  const args = [userId];
  let where = "v.id_usuario=? AND v.activo=1 AND s.activo=1";
  const scope = ["hoy", "proximas", "todas"].includes(req.query.vista) ? req.query.vista : "hoy";
  if (scope === "hoy") where += " AND v.fecha_entrega=CURDATE() AND v.estado='pendiente'";
  if (scope === "proximas") where += " AND v.fecha_entrega>=CURDATE() AND v.estado='pendiente'";
  if (STATES.includes(req.query.estado) && scope === "todas") {
    where += " AND v.estado=?";
    args.push(req.query.estado);
  }
  if (["true", "false"].includes(req.query.pagado)) {
    where += " AND s.pagado=?";
    args.push(req.query.pagado === "true" ? 1 : 0);
  }
  if (req.query.buscar) {
    const term = `%${String(req.query.buscar).trim()}%`;
    where += " AND (v.cliente_nombre LIKE ? OR v.tipo_nombre LIKE ?)";
    args.push(term, term);
  }
  const page = Math.max(entero(Number(req.query.page)) || 1, 1);
  const limit = Math.min(Math.max(entero(Number(req.query.limit)) || 6, 1), 50);
  const [[count]] = await db.query(
    `SELECT COUNT(DISTINCT v.id_cliente) total FROM pedidos_viandas v
     JOIN series_viandas s ON s.id_serie=v.id_serie AND s.id_usuario=v.id_usuario WHERE ${where}`,
    args,
  );
  const [rows] = await db.query(
    `SELECT v.id_cliente,MAX(v.cliente_nombre) cliente_nombre,
      MAX(v.cliente_telefono) cliente_telefono,MAX(v.cliente_direccion) cliente_direccion,
      COUNT(*) entregas_visibles,SUM(v.estado='pendiente') pendientes_visibles,
      MIN(CASE WHEN v.estado='pendiente' THEN v.fecha_entrega END) proxima_fecha,
      MIN(CASE WHEN v.estado='pendiente' THEN v.hora_entrega END) proxima_hora,
      GROUP_CONCAT(DISTINCT v.tipo_nombre ORDER BY v.tipo_nombre SEPARATOR ', ') tipos,
      (SELECT COUNT(*) FROM pedidos_viandas p WHERE p.id_usuario=v.id_usuario AND p.id_cliente=v.id_cliente AND p.activo=1 AND p.estado='pendiente' AND p.fecha_entrega>=CURDATE()) pendientes_totales,
      (SELECT COALESCE(SUM(sr.total_plan-sr.monto_pagado),0) FROM series_viandas sr WHERE sr.id_usuario=v.id_usuario AND sr.id_cliente=v.id_cliente AND sr.activo=1) saldo_pendiente,
      (SELECT COUNT(*) FROM series_viandas sr WHERE sr.id_usuario=v.id_usuario AND sr.id_cliente=v.id_cliente AND sr.activo=1) planes_activos,
      MAX(c.latitud) latitud,MAX(c.longitud) longitud
     FROM pedidos_viandas v
     JOIN series_viandas s ON s.id_serie=v.id_serie AND s.id_usuario=v.id_usuario
     LEFT JOIN clientes c ON c.id_cliente=v.id_cliente AND c.id_usuario=v.id_usuario
     WHERE ${where}
     GROUP BY v.id_cliente,v.id_usuario
     ORDER BY (proxima_fecha IS NULL) ASC,proxima_fecha ASC,proxima_hora ASC,cliente_nombre ASC
     LIMIT ? OFFSET ?`,
    [...args, limit, (page - 1) * limit],
  );
  res.json({
    ok: true,
    data: rows,
    meta: { page, limit, total: Number(count.total), total_pages: Math.max(1, Math.ceil(Number(count.total) / limit)) },
  });
};

exports.client = async (req, res) => {
  const userId = req.usuario.id_usuario;
  const clientId = Number(req.params.id_cliente);
  const [[client]] = await db.query(
    `SELECT id_cliente,nombre,telefono,direccion,latitud,longitud,google_place_id
     FROM clientes WHERE id_cliente=? AND id_usuario=? AND activo=1`,
    [clientId, userId],
  );
  if (!client)
    return res.status(404).json({ ok: false, mensaje: "Cliente no encontrado" });
  const [series] = await db.query(
    `SELECT s.*,
      (SELECT COUNT(*) FROM pedidos_viandas v WHERE v.id_serie=s.id_serie AND v.activo=1) cantidad_entregas,
      (SELECT COUNT(*) FROM pedidos_viandas v WHERE v.id_serie=s.id_serie AND v.activo=1 AND v.estado='pendiente' AND v.fecha_entrega>=CURDATE()) entregas_pendientes
     FROM series_viandas s WHERE s.id_usuario=? AND s.id_cliente=? AND s.activo=1
     ORDER BY s.fecha_inicio DESC,s.fecha_creacion DESC`,
    [userId, clientId],
  );
  const [deliveries] = await db.query(
    `SELECT v.* FROM pedidos_viandas v WHERE v.id_usuario=? AND v.id_cliente=? AND v.activo=1
     ORDER BY v.estado='pendiente' DESC,v.fecha_entrega ASC,v.hora_entrega ASC`,
    [userId, clientId],
  );
  const details = await detailsForOrders(db, userId, deliveries.map((row) => row.id_pedido_vianda));
  let payments = [];
  if (series.length)
    [payments] = await db.query(
      `SELECT * FROM pagos_viandas WHERE id_usuario=? AND activo=1
       AND id_serie IN (${series.map(() => "?").join(",")})
       ORDER BY fecha_pago DESC,id_pago_vianda DESC`,
      [userId, ...series.map((item) => item.id_serie)],
    );
  res.json({
    ok: true,
    data: {
      cliente: client,
      series: series.map((item) => ({
        ...item,
        entregas: deliveries
          .filter((delivery) => delivery.id_serie === item.id_serie)
          .map((delivery) => ({
            ...delivery,
            items: details.filter((detail) => detail.id_pedido_vianda === delivery.id_pedido_vianda),
          })),
        pagos: payments.filter((payment) => payment.id_serie === item.id_serie),
      })),
    },
  });
};

exports.create = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.usuario.id_usuario;
    await ensureConfiguration(connection, userId);
    const values = await orderValues(connection, userId, req.body);
    const frequency = FREQUENCIES.includes(req.body.frecuencia) ? req.body.frecuencia : "unico";
    const dates = deliveryDates(req.body.fecha_inicio, req.body.fecha_fin, frequency, req.body.dias_semana);
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(req.body.hora_entrega || ""))
      ? `${req.body.hora_entrega}:00`
      : null;
    if (!time)
      throw Object.assign(new Error("Hora de entrega inválida"), { status: 400 });
    const seriesId = randomUUID();
    const totalPlan = round(values.discount.total * dates.length);
    const paidFull = booleanValue(req.body.pagado);
    const initialPayment = paidFull ? totalPlan : numero(req.body.pago_inicial || 0) || 0;
    if (initialPayment < 0 || initialPayment > totalPlan)
      throw Object.assign(new Error("El adelanto inicial es inválido"), { status: 400 });
    const method = paymentMethod(req.body.metodo_pago);
    const notes = String(req.body.observaciones || "").trim() || null;
    const days = frequency === "unico"
      ? null
      : JSON.stringify([...selectedWeekdays(frequency, req.body.dias_semana, new Date(`${dates[0]}T12:00:00Z`))]);
    await connection.query(
      `INSERT INTO series_viandas
       (id_serie,id_usuario,id_cliente,cliente_nombre,cliente_telefono,cliente_direccion,frecuencia,fecha_inicio,fecha_fin,dias_semana_json,metodo_pago,total_plan,monto_pagado,pagado,observaciones)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,0,?)`,
      [seriesId, userId, values.client.id_cliente, values.client.nombre,
        values.client.telefono, values.client.direccion, frequency, dates[0],
        dates.at(-1), days, method, totalPlan, notes],
    );
    const header = headerFor(values.items);
    const state = req.body.estado === "entregado" ? "entregado" : "pendiente";
    const ids = [];
    for (const deliveryDate of dates) {
      const [result] = await connection.query(
        `INSERT INTO pedidos_viandas
         (id_usuario,id_serie,id_cliente,cliente_nombre,cliente_telefono,cliente_direccion,id_tipo_vianda,tipo_nombre,cantidad,precio_unitario,
          con_postre,precio_postre_unitario,con_envio,costo_envio,subtotal,descuento_tipo,descuento_valor,descuento_importe,total,
          fecha_entrega,hora_entrega,estado,pagado,fecha_pago,metodo_pago,observaciones)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL,?,?)`,
        [userId, seriesId, values.client.id_cliente, values.client.nombre,
          values.client.telefono, values.client.direccion, header.idType,
          header.typeName, header.quantity, header.unitPrice, header.dessert ? 1 : 0,
          header.dessertPrice, values.shipping ? 1 : 0, values.shippingPrice,
          values.subtotal, values.discount.type, values.discount.value,
          values.discount.amount, values.discount.total, deliveryDate, time,
          state, method, notes],
      );
      ids.push(result.insertId);
      await insertDetails(connection, userId, result.insertId, values.items);
    }
    if (initialPayment > 0)
      await insertPayment(connection, userId, seriesId, initialPayment, method,
        req.body.fecha_pago, req.body.pago_observaciones);
    else if (totalPlan === 0) {
      await connection.query(
        "UPDATE series_viandas SET pagado=1 WHERE id_serie=? AND id_usuario=?",
        [seriesId, userId],
      );
      await connection.query(
        "UPDATE pedidos_viandas SET pagado=1 WHERE id_serie=? AND id_usuario=?",
        [seriesId, userId],
      );
    }
    await connection.commit();
    res.status(201).json({
      ok: true,
      mensaje: dates.length === 1 ? "Pedido de viandas creado" : `${dates.length} entregas programadas`,
      data: {
        id_serie: seriesId,
        pedidos: ids,
        cantidad_entregas: dates.length,
        total_plan: totalPlan,
        monto_pagado: initialPayment,
        saldo_pendiente: round(totalPlan - initialPayment),
      },
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.update = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.usuario.id_usuario;
    const [[current]] = await connection.query(
      `SELECT v.*,s.total_plan,s.monto_pagado FROM pedidos_viandas v
       JOIN series_viandas s ON s.id_serie=v.id_serie
       WHERE v.id_pedido_vianda=? AND v.id_usuario=? AND v.activo=1 AND v.estado<>'cancelado' FOR UPDATE`,
      [req.params.id, userId],
    );
    if (!current)
      throw Object.assign(new Error("Pedido de vianda no encontrado"), { status: 404 });
    if (!fechaValida(req.body.fecha_entrega) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(req.body.hora_entrega || "")))
      throw Object.assign(new Error("Fecha u hora inválida"), { status: 400 });
    const values = await orderValues(connection, userId, req.body);
    const newPlanTotal = round(Number(current.total_plan) - Number(current.total) + values.discount.total);
    if (Number(current.monto_pagado) > newPlanTotal + 0.005)
      throw Object.assign(new Error("No se puede reducir el pedido por debajo del monto ya pagado"), {
        status: 409,
      });
    const header = headerFor(values.items);
    const completed = Number(current.monto_pagado) + 0.005 >= newPlanTotal;
    const state = STATES.includes(req.body.estado) ? req.body.estado : current.estado;
    const method = paymentMethod(req.body.metodo_pago || current.metodo_pago);
    await connection.query(
      `UPDATE pedidos_viandas SET id_cliente=?,cliente_nombre=?,cliente_telefono=?,cliente_direccion=?,id_tipo_vianda=?,tipo_nombre=?,cantidad=?,precio_unitario=?,
       con_postre=?,precio_postre_unitario=?,con_envio=?,costo_envio=?,subtotal=?,descuento_tipo=?,descuento_valor=?,descuento_importe=?,total=?,fecha_entrega=?,hora_entrega=?,
       estado=?,pagado=?,metodo_pago=?,observaciones=? WHERE id_pedido_vianda=? AND id_usuario=?`,
      [values.client.id_cliente, values.client.nombre, values.client.telefono,
        values.client.direccion, header.idType, header.typeName, header.quantity,
        header.unitPrice, header.dessert ? 1 : 0, header.dessertPrice,
        values.shipping ? 1 : 0, values.shippingPrice, values.subtotal,
        values.discount.type, values.discount.value, values.discount.amount,
        values.discount.total, req.body.fecha_entrega,
        `${req.body.hora_entrega}:00`, state, completed ? 1 : 0, method,
        String(req.body.observaciones || "").trim() || null, req.params.id, userId],
    );
    await connection.query(
      "DELETE FROM pedido_vianda_detalles WHERE id_pedido_vianda=? AND id_usuario=?",
      [req.params.id, userId],
    );
    await insertDetails(connection, userId, Number(req.params.id), values.items);
    await connection.query(
      `UPDATE series_viandas SET id_cliente=?,cliente_nombre=?,cliente_telefono=?,cliente_direccion=?,total_plan=?,pagado=?,metodo_pago=?
       WHERE id_serie=? AND id_usuario=?`,
      [values.client.id_cliente, values.client.nombre, values.client.telefono,
        values.client.direccion, newPlanTotal, completed ? 1 : 0, method,
        current.id_serie, userId],
    );
    await connection.commit();
    res.json({ ok: true, mensaje: "Entrega de viandas actualizada" });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.state = async (req, res) => {
  if (!STATES.includes(req.body.estado))
    return res.status(400).json({ ok: false, mensaje: "Estado inválido" });
  const [result] = await db.query(
    "UPDATE pedidos_viandas SET estado=? WHERE id_pedido_vianda=? AND id_usuario=? AND activo=1",
    [req.body.estado, req.params.id, req.usuario.id_usuario],
  );
  if (!result.affectedRows)
    return res.status(404).json({ ok: false, mensaje: "Pedido de vianda no encontrado" });
  const [[row]] = await db.query(
    "SELECT id_pedido_vianda,estado,pagado,fecha_actualizacion FROM pedidos_viandas WHERE id_pedido_vianda=? AND id_usuario=?",
    [req.params.id, req.usuario.id_usuario],
  );
  res.json({ ok: true, mensaje: "Estado actualizado", data: row });
};

exports.addPayment = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const payment = await insertPayment(connection, req.usuario.id_usuario,
      req.params.id_serie, req.body.monto, req.body.metodo_pago,
      req.body.fecha_pago, req.body.observaciones);
    const [[series]] = await connection.query(
      `SELECT id_serie,total_plan,monto_pagado,pagado,metodo_pago,
       GREATEST(total_plan-monto_pagado,0) saldo_pendiente
       FROM series_viandas WHERE id_serie=? AND id_usuario=?`,
      [req.params.id_serie, req.usuario.id_usuario],
    );
    await connection.commit();
    res.status(201).json({ ok: true, mensaje: "Pago registrado", data: { payment, series } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.dailyPayment = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.usuario.id_usuario;
    const [[delivery]] = await connection.query(
      `SELECT v.id_pedido_vianda,v.id_serie,v.total,s.total_plan,s.monto_pagado,s.metodo_pago
       FROM pedidos_viandas v JOIN series_viandas s ON s.id_serie=v.id_serie
       WHERE v.id_pedido_vianda=? AND v.id_usuario=? AND v.activo=1 AND v.estado<>'cancelado' FOR UPDATE`,
      [req.params.id, userId],
    );
    if (!delivery)
      throw Object.assign(new Error("Entrega de vianda no encontrada"), { status: 404 });
    const remaining = round(Number(delivery.total_plan) - Number(delivery.monto_pagado));
    if (remaining <= 0)
      throw Object.assign(new Error("La reserva ya está pagada por completo"), { status: 409 });
    const amount = Math.min(Number(delivery.total), remaining);
    const payment = await insertPayment(
      connection,
      userId,
      delivery.id_serie,
      amount,
      req.body.metodo_pago || delivery.metodo_pago,
      req.body.fecha_pago,
      req.body.observaciones || `Pago correspondiente a la entrega #${delivery.id_pedido_vianda}`,
      delivery.id_pedido_vianda,
    );
    const [[series]] = await connection.query(
      `SELECT total_plan,monto_pagado,pagado,GREATEST(total_plan-monto_pagado,0) saldo_pendiente
       FROM series_viandas WHERE id_serie=? AND id_usuario=?`,
      [delivery.id_serie, userId],
    );
    await connection.commit();
    res.status(201).json({
      ok: true,
      mensaje: `Pago diario de $${amount.toFixed(2)} registrado`,
      data: { payment, series },
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.paid = async (req, res) => {
  if (!booleanValue(req.body.pagado))
    return res.status(409).json({
      ok: false,
      mensaje: "Los pagos parciales forman un historial y no se desmarcan. Registra el saldo pendiente o corrige el movimiento desde caja.",
    });
  const [[order]] = await db.query(
    `SELECT v.id_serie,s.total_plan,s.monto_pagado,s.metodo_pago FROM pedidos_viandas v
     JOIN series_viandas s ON s.id_serie=v.id_serie
     WHERE v.id_pedido_vianda=? AND v.id_usuario=? AND v.activo=1`,
    [req.params.id, req.usuario.id_usuario],
  );
  if (!order)
    return res.status(404).json({ ok: false, mensaje: "Pedido de vianda no encontrado" });
  const remaining = round(Number(order.total_plan) - Number(order.monto_pagado));
  if (remaining <= 0)
    return res.json({ ok: true, mensaje: "La reserva ya está pagada" });
  req.params.id_serie = order.id_serie;
  req.body.monto = remaining;
  req.body.metodo_pago = req.body.metodo_pago || order.metodo_pago;
  return exports.addPayment(req, res);
};

exports.remove = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[order]] = await connection.query(
      `SELECT v.id_serie,v.total,s.total_plan,s.monto_pagado FROM pedidos_viandas v
       JOIN series_viandas s ON s.id_serie=v.id_serie
       WHERE v.id_pedido_vianda=? AND v.id_usuario=? AND v.activo=1 FOR UPDATE`,
      [req.params.id, req.usuario.id_usuario],
    );
    if (!order)
      throw Object.assign(new Error("Pedido de vianda no encontrado"), { status: 404 });
    const newTotal = round(Number(order.total_plan) - Number(order.total));
    if (Number(order.monto_pagado) > newTotal + 0.005)
      throw Object.assign(new Error("No se puede eliminar: el monto pagado superaría el nuevo total"), {
        status: 409,
      });
    await connection.query(
      "UPDATE pedidos_viandas SET activo=0,estado='cancelado' WHERE id_pedido_vianda=? AND id_usuario=?",
      [req.params.id, req.usuario.id_usuario],
    );
    await connection.query(
      `UPDATE series_viandas SET total_plan=?,pagado=(monto_pagado>=?)
       WHERE id_serie=? AND id_usuario=?`,
      [newTotal, newTotal, order.id_serie, req.usuario.id_usuario],
    );
    await connection.commit();
    res.json({ ok: true, mensaje: "Entrega eliminada" });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
