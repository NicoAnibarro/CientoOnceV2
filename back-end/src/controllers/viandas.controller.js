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
  const amount = round(
    type === "porcentaje" ? (subtotal * value) / 100 : value,
  );
  if (amount > subtotal)
    throw Object.assign(
      new Error("El descuento no puede superar el subtotal"),
      {
        status: 400,
      },
    );
  return { type, value, amount, total: round(subtotal - amount) };
}

function selectedWeekdays(frequency, weekDays, start) {
  const selected = new Set(
    (Array.isArray(weekDays) ? weekDays : [])
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );
  if (frequency === "semanal" && !selected.size)
    selected.add(start.getUTCDay());
  if (["diario", "mensual"].includes(frequency) && !selected.size)
    WEEKDAYS.forEach((day) => selected.add(day));
  return selected;
}

function deliveryDates(startText, endText, frequency, weekDays) {
  if (!fechaValida(startText))
    throw Object.assign(new Error("Fecha inicial inválida"), { status: 400 });
  const normalizedFrequency = FREQUENCIES.includes(frequency)
    ? frequency
    : "unico";
  const finalText = normalizedFrequency === "unico" ? startText : endText;
  if (!fechaValida(finalText))
    throw Object.assign(new Error("Fecha final inválida"), { status: 400 });
  const start = new Date(`${startText}T12:00:00Z`);
  const end = new Date(`${finalText}T12:00:00Z`);
  if (end < start)
    throw Object.assign(
      new Error("La fecha final no puede ser anterior a la inicial"),
      {
        status: 400,
      },
    );
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
    throw Object.assign(
      new Error("El plan genera demasiadas entregas; acorta el rango"),
      {
        status: 400,
      },
    );
  return dates;
}

async function ensureConfiguration(connection, userId) {
  await connection.query(
    "INSERT INTO configuraciones_viandas(id_usuario) VALUES(?) ON CONFLICT (id_usuario) DO NOTHING",
    [userId],
  );
  await connection.query(
    "INSERT INTO tipos_vianda(id_usuario,nombre,precio_base) VALUES(?,'Vianda',0),(?,'Vianda reforzada',0) ON CONFLICT (id_usuario,nombre) DO NOTHING",
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
  const requested =
    Array.isArray(body.items) && body.items.length
      ? body.items
      : [
          {
            id_tipo_vianda: body.id_tipo_vianda,
            cantidad: body.cantidad,
            precio_unitario: body.precio_unitario,
            con_postre: body.con_postre,
            precio_postre_unitario: body.precio_postre_unitario,
          },
        ];
  if (requested.length > 20)
    throw Object.assign(new Error("Una entrega admite hasta 20 renglones"), {
      status: 400,
    });
  const ids = [
    ...new Set(
      requested.map((item) => Number(item.id_tipo_vianda)).filter(Boolean),
    ),
  ];
  if (!ids.length)
    throw Object.assign(new Error("Agrega al menos un tipo de vianda"), {
      status: 400,
    });
  const [types] = await connection.query(
    `SELECT id_tipo_vianda,nombre,precio_base FROM tipos_vianda
     WHERE id_usuario=? AND activo=1 AND id_tipo_vianda IN (${ids.map(() => "?").join(",")})`,
    [userId, ...ids],
  );
  const typeMap = new Map(
    types.map((item) => [Number(item.id_tipo_vianda), item]),
  );
  const items = requested.map((raw) => {
    const type = typeMap.get(Number(raw.id_tipo_vianda));
    if (!type)
      throw Object.assign(new Error("Tipo de vianda no encontrado"), {
        status: 404,
      });
    const quantity = entero(Number(raw.cantidad));
    const unitPrice = numero(raw.precio_unitario ?? type.precio_base);
    const dessert = booleanValue(raw.con_postre);
    const dessertPrice = dessert ? numero(raw.precio_postre_unitario || 0) : 0;
    if (
      !quantity ||
      quantity < 1 ||
      quantity > 999 ||
      unitPrice === null ||
      unitPrice < 0 ||
      dessertPrice === null ||
      dessertPrice < 0
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
  const subtotal = round(
    items.reduce((sum, item) => sum + item.subtotal, 0) + shippingPrice,
  );
  const discount = calculateDiscount(subtotal, body);
  return { client, items, shipping, shippingPrice, subtotal, discount };
}

function headerFor(items) {
  return {
    idType: items[0].idType,
    typeName: items
      .map((item) => `${item.typeName} x${item.quantity}`)
      .join(" + ")
      .slice(0, 100),
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    unitPrice: items[0].unitPrice,
    dessert: items.some((item) => item.dessert),
    dessertPrice: items.reduce(
      (sum, item) => Math.max(sum, item.dessertPrice),
      0,
    ),
  };
}

async function insertDetails(connection, userId, orderId, items) {
  for (const item of items) {
    await connection.query(
      `INSERT INTO pedido_vianda_detalles
       (id_usuario,id_pedido_vianda,id_tipo_vianda,tipo_nombre,cantidad,precio_unitario,con_postre,precio_postre_unitario,subtotal)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [
        userId,
        orderId,
        item.idType,
        item.typeName,
        item.quantity,
        item.unitPrice,
        item.dessert ? 1 : 0,
        item.dessertPrice,
        item.subtotal,
      ],
    );
  }
}

async function syncSeries(connection, userId, seriesId) {
  const [[totals]] = await connection.query(
    `SELECT
       COALESCE((SELECT SUM(v.total) FROM pedidos_viandas v
         WHERE v.id_usuario=? AND v.id_serie=? AND v.activo=1 AND v.estado<>'cancelado'),0) total_plan,
       COALESCE((SELECT SUM(p.monto) FROM pagos_viandas p
         WHERE p.id_usuario=? AND p.id_serie=? AND p.activo=1),0) monto_pagado`,
    [userId, seriesId, userId, seriesId],
  );
  const total = round(totals.total_plan);
  const paid = round(totals.monto_pagado);
  await connection.query(
    `UPDATE series_viandas SET total_plan=?,monto_pagado=?,pagado=?
     WHERE id_serie=? AND id_usuario=?`,
    [
      total,
      paid,
      total <= 0 || paid + 0.005 >= total ? 1 : 0,
      seriesId,
      userId,
    ],
  );
  const [[series]] = await connection.query(
    `SELECT id_serie,total_plan,monto_pagado,pagado,metodo_pago,
     GREATEST(total_plan-monto_pagado,0) saldo_pendiente
     FROM series_viandas WHERE id_serie=? AND id_usuario=?`,
    [seriesId, userId],
  );
  return series;
}

async function lockDeliverySeries(connection, userId, orderId) {
  const [[delivery]] = await connection.query(
    "SELECT id_serie FROM pedidos_viandas WHERE id_pedido_vianda=? AND id_usuario=? AND activo=1",
    [orderId, userId],
  );
  if (delivery)
    await connection.query(
      "SELECT id_serie FROM series_viandas WHERE id_serie=? AND id_usuario=? FOR UPDATE",
      [delivery.id_serie, userId],
    );
}

async function setDeliveryPayment(
  connection,
  userId,
  orderId,
  paidValue,
  methodValue,
  date,
  sync = true,
) {
  const paid = booleanValue(paidValue);
  await lockDeliverySeries(connection, userId, orderId);
  const [[delivery]] = await connection.query(
    `SELECT v.id_pedido_vianda,v.id_serie,v.fecha_entrega,v.total,v.estado,v.pagado,v.fecha_pago,
      s.cliente_nombre,v.metodo_pago
     FROM pedidos_viandas v JOIN series_viandas s ON s.id_serie=v.id_serie
     WHERE v.id_pedido_vianda=? AND v.id_usuario=? AND v.activo=1 FOR UPDATE`,
    [orderId, userId],
  );
  if (!delivery)
    throw Object.assign(new Error("Entrega de vianda no encontrada"), {
      status: 404,
    });
  if (paid && delivery.estado === "cancelado")
    throw Object.assign(new Error("No se puede cobrar una entrega cancelada"), {
      status: 409,
    });
  const method = paymentMethod(methodValue || delivery.metodo_pago);
  if (date != null && !fechaValida(date))
    throw Object.assign(new Error("Fecha de pago inválida"), { status: 400 });
  const [[existing]] = await connection.query(
    `SELECT id_pago_vianda,activo,fecha_pago FROM pagos_viandas
     WHERE id_usuario=? AND id_pedido_vianda=? FOR UPDATE`,
    [userId, orderId],
  );
  const paymentDate =
    existing?.activo && delivery.pagado
      ? existing.fecha_pago
      : fechaValida(date)
        ? `${date} 12:00:00`
        : null;
  let paymentId = existing?.id_pago_vianda || null;
  if (paid && Number(delivery.total) > 0) {
    if (existing) {
      await connection.query(
        `UPDATE pagos_viandas SET monto=?,metodo_pago=?,activo=1,
         fecha_pago=COALESCE(?,NOW()),observaciones=?
         WHERE id_pago_vianda=? AND id_usuario=?`,
        [
          delivery.total,
          method,
          paymentDate,
          `Cobro de entrega del ${String(delivery.fecha_entrega).slice(0, 10)}`,
          paymentId,
          userId,
        ],
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO pagos_viandas
         (id_usuario,id_serie,id_pedido_vianda,monto,metodo_pago,fecha_pago,observaciones)
         VALUES(?,?,?,?,?,COALESCE(?,NOW()),?)`,
        [
          userId,
          delivery.id_serie,
          orderId,
          delivery.total,
          method,
          paymentDate,
          `Cobro de entrega del ${String(delivery.fecha_entrega).slice(0, 10)}`,
        ],
      );
      paymentId = result.insertId;
    }
    await connection.query(
      `INSERT INTO movimientos_caja
       (id_usuario,tipo,categoria,concepto,monto,metodo_pago,origen,origen_id,anulado,fecha_movimiento,observaciones)
       VALUES(?,'ingreso','pedido',?,?,?,'vianda',?,0,COALESCE(?,NOW()),?)
       ON CONFLICT (id_usuario,origen,origen_id) DO UPDATE SET monto=EXCLUDED.monto,metodo_pago=EXCLUDED.metodo_pago,
       anulado=0,fecha_movimiento=CASE WHEN movimientos_caja.anulado=1 THEN EXCLUDED.fecha_movimiento ELSE movimientos_caja.fecha_movimiento END,observaciones=EXCLUDED.observaciones`,
      [
        userId,
        `Vianda ${delivery.cliente_nombre || "Cliente"} · ${String(delivery.fecha_entrega).slice(0, 10)}`,
        delivery.total,
        method,
        paymentId,
        paymentDate,
        `Reserva ${delivery.id_serie}`,
      ],
    );
  } else if (existing) {
    await connection.query(
      "UPDATE pagos_viandas SET activo=0 WHERE id_pago_vianda=? AND id_usuario=?",
      [paymentId, userId],
    );
    await connection.query(
      `UPDATE movimientos_caja SET anulado=1
       WHERE id_usuario=? AND origen='vianda' AND origen_id=?`,
      [userId, paymentId],
    );
  }
  await connection.query(
    `UPDATE pedidos_viandas SET pagado=?,metodo_pago=?,
     fecha_pago=CASE WHEN ?=1 THEN COALESCE(?,fecha_pago,NOW()) ELSE NULL END
     WHERE id_pedido_vianda=? AND id_usuario=?`,
    [paid ? 1 : 0, method, paid ? 1 : 0, paymentDate, orderId, userId],
  );
  const series = sync
    ? await syncSeries(connection, userId, delivery.id_serie)
    : null;
  return {
    delivery: {
      id_pedido_vianda: Number(orderId),
      pagado: paid,
      metodo_pago: method,
    },
    payment: paymentId
      ? {
          id_pago_vianda: paymentId,
          monto: Number(delivery.total),
          metodo_pago: method,
        }
      : null,
    series,
    id_serie: delivery.id_serie,
  };
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
     ON CONFLICT (id_usuario) DO UPDATE SET precio_postre=EXCLUDED.precio_postre,precio_envio=EXCLUDED.precio_envio`,
    [req.usuario.id_usuario, dessert, shipping],
  );
  res.json({ ok: true, mensaje: "Configuración de viandas actualizada" });
};

exports.createType = async (req, res) => {
  const name = String(req.body.nombre || "").trim();
  const price = numero(req.body.precio_base);
  if (!name || name.length > 100 || price === null || price < 0)
    return res
      .status(400)
      .json({ ok: false, mensaje: "Nombre o precio inválido" });
  try {
    const [result] = await db.query(
      `INSERT INTO tipos_vianda(id_usuario,nombre,precio_base) VALUES(?,?,?)
       ON CONFLICT (id_usuario,nombre) DO UPDATE SET activo=1,precio_base=EXCLUDED.precio_base WHERE tipos_vianda.activo=0`,
      [req.usuario.id_usuario, name, price],
    );
    if (!result.affectedRows)
      return res
        .status(409)
        .json({ ok: false, mensaje: "Ese tipo de vianda ya existe" });
    res.status(201).json({
      ok: true,
      data: {
        id_tipo_vianda: result.insertId,
        nombre: name,
        precio_base: price,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ ok: false, mensaje: "Ese tipo de vianda ya existe" });
    throw error;
  }
};

exports.updateType = async (req, res) => {
  const name = String(req.body.nombre || "").trim();
  const price = numero(req.body.precio_base);
  if (!name || name.length > 100 || price === null || price < 0)
    return res
      .status(400)
      .json({ ok: false, mensaje: "Nombre o precio inválido" });
  const [result] = await db.query(
    "UPDATE tipos_vianda SET nombre=?,precio_base=? WHERE id_tipo_vianda=? AND id_usuario=? AND activo=1",
    [name, price, req.params.id, req.usuario.id_usuario],
  );
  if (!result.affectedRows)
    return res
      .status(404)
      .json({ ok: false, mensaje: "Tipo de vianda no encontrado" });
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
    return res
      .status(404)
      .json({ ok: false, mensaje: "Tipo de vianda no encontrado" });
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
    where += " AND v.pagado=?";
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
    where +=
      " AND (v.cliente_nombre LIKE ? OR v.tipo_nombre LIKE ? OR v.cliente_direccion LIKE ?)";
    args.push(term, term, term);
  }
  const page = Math.max(entero(Number(req.query.page)) || 1, 1);
  const limit = Math.min(
    Math.max(entero(Number(req.query.limit)) || 8, 1),
    100,
  );
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
  const details = await detailsForOrders(
    db,
    userId,
    rows.map((row) => row.id_pedido_vianda),
  );
  res.json({
    ok: true,
    data: rows.map((row) => ({
      ...row,
      items: details.filter(
        (detail) => detail.id_pedido_vianda === row.id_pedido_vianda,
      ),
    })),
    meta: {
      page,
      limit,
      total: Number(count.total),
      total_pages: Math.max(1, Math.ceil(Number(count.total) / limit)),
    },
  });
};

exports.clients = async (req, res) => {
  const userId = req.usuario.id_usuario;
  const args = [userId];
  let where = "v.id_usuario=? AND v.activo=1 AND s.activo=1";
  const scope = ["hoy", "proximas", "todas"].includes(req.query.vista)
    ? req.query.vista
    : "hoy";
  if (scope === "hoy")
    where += " AND v.fecha_entrega=CURDATE() AND v.estado='pendiente'";
  if (scope === "proximas")
    where += " AND v.fecha_entrega>=CURDATE() AND v.estado='pendiente'";
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
      COUNT(*) entregas_visibles,SUM(CASE WHEN v.estado='pendiente' THEN 1 ELSE 0 END) pendientes_visibles,
      MIN(CASE WHEN v.estado='pendiente' THEN v.fecha_entrega END) proxima_fecha,
      MIN(CASE WHEN v.estado='pendiente' THEN v.hora_entrega END) proxima_hora,
      STRING_AGG(DISTINCT v.tipo_nombre, ', ' ORDER BY v.tipo_nombre) tipos,
      (SELECT COUNT(*) FROM pedidos_viandas p WHERE p.id_usuario=v.id_usuario AND p.id_cliente=v.id_cliente AND p.activo=1 AND p.estado='pendiente' AND p.fecha_entrega>=CURDATE()) pendientes_totales,
      (SELECT COALESCE(SUM(sr.total_plan),0) FROM series_viandas sr WHERE sr.id_usuario=v.id_usuario AND sr.id_cliente=v.id_cliente AND sr.activo=1) total_planes,
      (SELECT COALESCE(SUM(sr.monto_pagado),0) FROM series_viandas sr WHERE sr.id_usuario=v.id_usuario AND sr.id_cliente=v.id_cliente AND sr.activo=1) cobrado_total,
      (SELECT COALESCE(SUM(sr.total_plan-sr.monto_pagado),0) FROM series_viandas sr WHERE sr.id_usuario=v.id_usuario AND sr.id_cliente=v.id_cliente AND sr.activo=1) saldo_pendiente,
      (SELECT COUNT(*) FROM series_viandas sr WHERE sr.id_usuario=v.id_usuario AND sr.id_cliente=v.id_cliente AND sr.activo=1) planes_activos,
      MAX(c.latitud) latitud,MAX(c.longitud) longitud
     FROM pedidos_viandas v
     JOIN series_viandas s ON s.id_serie=v.id_serie AND s.id_usuario=v.id_usuario
     LEFT JOIN clientes c ON c.id_cliente=v.id_cliente AND c.id_usuario=v.id_usuario
     WHERE ${where}
     GROUP BY v.id_cliente,v.id_usuario
     ORDER BY
      (MIN(CASE WHEN v.estado='pendiente' THEN v.fecha_entrega END) IS NULL) ASC,
      MIN(CASE WHEN v.estado='pendiente' THEN v.fecha_entrega END) ASC,
      MIN(CASE WHEN v.estado='pendiente' THEN v.hora_entrega END) ASC,
      MAX(v.cliente_nombre) ASC
     LIMIT ? OFFSET ?`,
    [...args, limit, (page - 1) * limit],
  );
  res.json({
    ok: true,
    data: rows,
    meta: {
      page,
      limit,
      total: Number(count.total),
      total_pages: Math.max(1, Math.ceil(Number(count.total) / limit)),
    },
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
    return res
      .status(404)
      .json({ ok: false, mensaje: "Cliente no encontrado" });
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
     ORDER BY v.fecha_entrega ASC,v.hora_entrega ASC,v.id_pedido_vianda ASC`,
    [userId, clientId],
  );
  const details = await detailsForOrders(
    db,
    userId,
    deliveries.map((row) => row.id_pedido_vianda),
  );
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
            items: details.filter(
              (detail) => detail.id_pedido_vianda === delivery.id_pedido_vianda,
            ),
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
    const frequency = FREQUENCIES.includes(req.body.frecuencia)
      ? req.body.frecuencia
      : "unico";
    const dates = deliveryDates(
      req.body.fecha_inicio,
      req.body.fecha_fin,
      frequency,
      req.body.dias_semana,
    );
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(
      String(req.body.hora_entrega || ""),
    )
      ? `${req.body.hora_entrega}:00`
      : null;
    if (!time)
      throw Object.assign(new Error("Hora de entrega inválida"), {
        status: 400,
      });
    const seriesId = randomUUID();
    const totalPlan = round(values.discount.total * dates.length);
    const paidFull = booleanValue(req.body.pagado);
    const initialPayment = paidFull ? totalPlan : 0;
    if (initialPayment < 0 || initialPayment > totalPlan)
      throw Object.assign(new Error("El adelanto inicial es inválido"), {
        status: 400,
      });
    const method = paymentMethod(req.body.metodo_pago);
    const notes = String(req.body.observaciones || "").trim() || null;
    const days =
      frequency === "unico"
        ? null
        : JSON.stringify([
            ...selectedWeekdays(
              frequency,
              req.body.dias_semana,
              new Date(`${dates[0]}T12:00:00Z`),
            ),
          ]);
    await connection.query(
      `INSERT INTO series_viandas
       (id_serie,id_usuario,id_cliente,cliente_nombre,cliente_telefono,cliente_direccion,frecuencia,fecha_inicio,fecha_fin,dias_semana_json,metodo_pago,total_plan,monto_pagado,pagado,observaciones)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,0,?)`,
      [
        seriesId,
        userId,
        values.client.id_cliente,
        values.client.nombre,
        values.client.telefono,
        values.client.direccion,
        frequency,
        dates[0],
        dates.at(-1),
        days,
        method,
        totalPlan,
        notes,
      ],
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
        [
          userId,
          seriesId,
          values.client.id_cliente,
          values.client.nombre,
          values.client.telefono,
          values.client.direccion,
          header.idType,
          header.typeName,
          header.quantity,
          header.unitPrice,
          header.dessert ? 1 : 0,
          header.dessertPrice,
          values.shipping ? 1 : 0,
          values.shippingPrice,
          values.subtotal,
          values.discount.type,
          values.discount.value,
          values.discount.amount,
          values.discount.total,
          deliveryDate,
          time,
          state,
          method,
          notes,
        ],
      );
      ids.push(result.insertId);
      await insertDetails(connection, userId, result.insertId, values.items);
    }
    if (paidFull || totalPlan === 0)
      for (const id of ids)
        await setDeliveryPayment(
          connection,
          userId,
          id,
          true,
          method,
          req.body.fecha_pago,
          false,
        );
    const series = await syncSeries(connection, userId, seriesId);
    await connection.commit();
    res.status(201).json({
      ok: true,
      mensaje:
        dates.length === 1
          ? "Pedido de viandas creado"
          : `${dates.length} entregas programadas`,
      data: {
        id_serie: seriesId,
        pedidos: ids,
        cantidad_entregas: dates.length,
        total_plan: totalPlan,
        monto_pagado: Number(series.monto_pagado),
        saldo_pendiente: Number(series.saldo_pendiente),
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
    await lockDeliverySeries(connection, userId, req.params.id);
    const [[current]] = await connection.query(
      `SELECT v.*,s.total_plan,s.monto_pagado FROM pedidos_viandas v
       JOIN series_viandas s ON s.id_serie=v.id_serie
       WHERE v.id_pedido_vianda=? AND v.id_usuario=? AND v.activo=1 AND v.estado<>'cancelado' FOR UPDATE`,
      [req.params.id, userId],
    );
    if (!current)
      throw Object.assign(new Error("Pedido de vianda no encontrado"), {
        status: 404,
      });
    if (Number(req.body.id_cliente) !== Number(current.id_cliente))
      throw Object.assign(
        new Error(
          "Una entrega debe conservar el cliente de su plan. Crea una reserva separada para otro cliente.",
        ),
        { status: 409 },
      );
    if (
      !fechaValida(req.body.fecha_entrega) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(req.body.hora_entrega || ""))
    )
      throw Object.assign(new Error("Fecha u hora inválida"), { status: 400 });
    const values = await orderValues(connection, userId, req.body);
    const header = headerFor(values.items);
    const state = STATES.includes(req.body.estado)
      ? req.body.estado
      : current.estado;
    const method = paymentMethod(req.body.metodo_pago || current.metodo_pago);
    await connection.query(
      `UPDATE pedidos_viandas SET id_cliente=?,cliente_nombre=?,cliente_telefono=?,cliente_direccion=?,id_tipo_vianda=?,tipo_nombre=?,cantidad=?,precio_unitario=?,
       con_postre=?,precio_postre_unitario=?,con_envio=?,costo_envio=?,subtotal=?,descuento_tipo=?,descuento_valor=?,descuento_importe=?,total=?,fecha_entrega=?,hora_entrega=?,
       estado=?,pagado=?,metodo_pago=?,observaciones=? WHERE id_pedido_vianda=? AND id_usuario=?`,
      [
        values.client.id_cliente,
        values.client.nombre,
        values.client.telefono,
        values.client.direccion,
        header.idType,
        header.typeName,
        header.quantity,
        header.unitPrice,
        header.dessert ? 1 : 0,
        header.dessertPrice,
        values.shipping ? 1 : 0,
        values.shippingPrice,
        values.subtotal,
        values.discount.type,
        values.discount.value,
        values.discount.amount,
        values.discount.total,
        req.body.fecha_entrega,
        `${req.body.hora_entrega}:00`,
        state,
        state === "cancelado" ? 0 : current.pagado ? 1 : 0,
        method,
        String(req.body.observaciones || "").trim() || null,
        req.params.id,
        userId,
      ],
    );
    await connection.query(
      "DELETE FROM pedido_vianda_detalles WHERE id_pedido_vianda=? AND id_usuario=?",
      [req.params.id, userId],
    );
    await insertDetails(
      connection,
      userId,
      Number(req.params.id),
      values.items,
    );
    if (state === "cancelado" && current.pagado)
      await setDeliveryPayment(
        connection,
        userId,
        Number(req.params.id),
        false,
        method,
        null,
        false,
      );
    else if (current.pagado)
      await setDeliveryPayment(
        connection,
        userId,
        Number(req.params.id),
        true,
        method,
        null,
        false,
      );
    await syncSeries(connection, userId, current.id_serie);
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
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await lockDeliverySeries(connection, req.usuario.id_usuario, req.params.id);
    const [[current]] = await connection.query(
      `SELECT id_pedido_vianda,id_serie,pagado,metodo_pago FROM pedidos_viandas
       WHERE id_pedido_vianda=? AND id_usuario=? AND activo=1 FOR UPDATE`,
      [req.params.id, req.usuario.id_usuario],
    );
    if (!current)
      throw Object.assign(new Error("Pedido de vianda no encontrado"), {
        status: 404,
      });
    await connection.query(
      "UPDATE pedidos_viandas SET estado=? WHERE id_pedido_vianda=? AND id_usuario=?",
      [req.body.estado, req.params.id, req.usuario.id_usuario],
    );
    if (req.body.estado === "cancelado")
      await setDeliveryPayment(
        connection,
        req.usuario.id_usuario,
        Number(req.params.id),
        false,
        current.metodo_pago,
        null,
      );
    await syncSeries(connection, req.usuario.id_usuario, current.id_serie);
    const [[row]] = await connection.query(
      `SELECT id_pedido_vianda,estado,pagado,fecha_actualizacion
       FROM pedidos_viandas WHERE id_pedido_vianda=? AND id_usuario=?`,
      [req.params.id, req.usuario.id_usuario],
    );
    await connection.commit();
    res.json({ ok: true, mensaje: "Estado actualizado", data: row });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

async function changeDeliveryPayment(req, res, forcedValue = null) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const paid =
      forcedValue === null ? booleanValue(req.body.pagado) : forcedValue;
    const result = await setDeliveryPayment(
      connection,
      req.usuario.id_usuario,
      Number(req.params.id),
      paid,
      req.body.metodo_pago,
      req.body.fecha_pago,
    );
    await connection.commit();
    res.json({
      ok: true,
      mensaje: paid ? "Cobro del día registrado" : "Cobro del día revertido",
      data: result,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Cambios del detalle del cliente: todos se confirman o todos se revierten.
exports.applyChanges = async (req, res) => {
  const changes = req.body?.cambios;
  if (!Array.isArray(changes) || !changes.length || changes.length > 520)
    return res
      .status(400)
      .json({ ok: false, mensaje: "Envía entre 1 y 520 entregas" });
  const ids = changes.map((item) => Number(item?.id_pedido_vianda));
  if (
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(ids).size !== ids.length
  )
    return res
      .status(400)
      .json({ ok: false, mensaje: "Entregas inválidas o repetidas" });
  const role = req.usuario.rol;
  const canState = [
    "propietario",
    "administrador",
    "ventas",
    "reparto",
  ].includes(role);
  const canPay = ["propietario", "administrador", "ventas", "caja"].includes(
    role,
  );
  for (const change of changes) {
    if (
      (change.estado !== undefined && !canState) ||
      (change.pagado !== undefined && !canPay)
    )
      return res
        .status(403)
        .json({ ok: false, mensaje: "Tu rol no permite estos cambios" });
    if (
      (change.estado === undefined && change.pagado === undefined) ||
      (change.estado !== undefined && !STATES.includes(change.estado)) ||
      (change.pagado !== undefined && typeof change.pagado !== "boolean") ||
      (change.metodo_pago !== undefined &&
        !PAYMENT_METHODS.includes(change.metodo_pago)) ||
      (change.fecha_pago != null && !fechaValida(change.fecha_pago))
    )
      return res
        .status(400)
        .json({ ok: false, mensaje: "Estado, pago o fecha inválidos" });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.usuario.id_usuario;
    const clientId = Number(req.params.id_cliente);
    // Mismo orden de bloqueo para cobros individuales y lotes.
    const [seriesRows] = await connection.query(
      "SELECT id_serie FROM series_viandas WHERE id_usuario=? AND id_cliente=? AND activo=1 ORDER BY id_serie FOR UPDATE",
      [userId, clientId],
    );
    const marks = ids.map(() => "?").join(",");
    const [deliveries] = await connection.query(
      `SELECT * FROM pedidos_viandas WHERE id_usuario=? AND id_cliente=? AND activo=1 AND id_pedido_vianda IN (${marks}) ORDER BY id_pedido_vianda FOR UPDATE`,
      [userId, clientId, ...ids],
    );
    const seriesIds = new Set(seriesRows.map((row) => row.id_serie));
    if (
      deliveries.length !== ids.length ||
      deliveries.some((row) => !seriesIds.has(row.id_serie))
    )
      throw Object.assign(
        new Error("Una entrega ya no está disponible para este cliente"),
        { status: 404 },
      );
    const affected = new Set();
    const byId = new Map(
      deliveries.map((row) => [Number(row.id_pedido_vianda), row]),
    );
    for (const change of [...changes].sort(
      (a, b) => a.id_pedido_vianda - b.id_pedido_vianda,
    )) {
      const current = byId.get(Number(change.id_pedido_vianda));
      const state = change.estado ?? current.estado;
      if (
        (change.estado !== undefined &&
          change.estado_anterior !== undefined &&
          current.estado !== change.estado_anterior &&
          current.estado !== state) ||
        (change.pagado !== undefined &&
          change.pagado_anterior !== undefined &&
          Boolean(current.pagado) !== change.pagado_anterior &&
          Boolean(current.pagado) !== change.pagado)
      )
        throw Object.assign(
          new Error(
            "Las entregas cambiaron en otra sesión. Recarga antes de aplicar.",
          ),
          { status: 409 },
        );
      if (
        current.estado === "cancelado" &&
        change.estado === undefined &&
        change.pagado === true
      )
        throw Object.assign(
          new Error("No se puede cobrar una entrega cancelada"),
          { status: 409 },
        );
      if (change.estado !== undefined && state !== current.estado)
        await connection.query(
          "UPDATE pedidos_viandas SET estado=? WHERE id_pedido_vianda=? AND id_usuario=?",
          [state, current.id_pedido_vianda, userId],
        );
      if (state === "cancelado") {
        if (change.pagado === true)
          throw Object.assign(
            new Error("Una entrega cancelada no puede quedar cobrada"),
            { status: 409 },
          );
        if (current.pagado && !canPay)
          throw Object.assign(
            new Error("Cancelar una entrega cobrada requiere permiso de caja"),
            { status: 403 },
          );
        await setDeliveryPayment(
          connection,
          userId,
          current.id_pedido_vianda,
          false,
          current.metodo_pago,
          null,
          false,
        );
      } else if (
        change.pagado !== undefined &&
        Boolean(current.pagado) !== change.pagado
      ) {
        await setDeliveryPayment(
          connection,
          userId,
          current.id_pedido_vianda,
          change.pagado,
          change.metodo_pago || current.metodo_pago,
          change.fecha_pago,
          false,
        );
      }
      affected.add(current.id_serie);
    }
    const updatedSeries = [];
    for (const id of [...affected].sort())
      updatedSeries.push(await syncSeries(connection, userId, id));
    const [updated] = await connection.query(
      `SELECT id_pedido_vianda,estado,pagado,metodo_pago,fecha_pago,fecha_actualizacion FROM pedidos_viandas WHERE id_usuario=? AND id_pedido_vianda IN (${marks}) ORDER BY id_pedido_vianda`,
      [userId, ...ids],
    );
    await connection.commit();
    res.json({
      ok: true,
      mensaje: "Cambios aplicados",
      data: { entregas: updated, series: updatedSeries },
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.addPayment = async (_req, res) =>
  res.status(409).json({
    ok: false,
    mensaje: "Los adelantos se registran marcando las fechas abonadas",
  });

exports.dailyPayment = async (req, res) =>
  changeDeliveryPayment(req, res, true);

exports.paid = async (req, res) => changeDeliveryPayment(req, res);

exports.remove = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await lockDeliverySeries(connection, req.usuario.id_usuario, req.params.id);
    const [[order]] = await connection.query(
      `SELECT v.id_serie,v.total,v.pagado,v.metodo_pago,s.total_plan,s.monto_pagado FROM pedidos_viandas v
       JOIN series_viandas s ON s.id_serie=v.id_serie
       WHERE v.id_pedido_vianda=? AND v.id_usuario=? AND v.activo=1 FOR UPDATE`,
      [req.params.id, req.usuario.id_usuario],
    );
    if (!order)
      throw Object.assign(new Error("Pedido de vianda no encontrado"), {
        status: 404,
      });
    if (order.pagado)
      await setDeliveryPayment(
        connection,
        req.usuario.id_usuario,
        Number(req.params.id),
        false,
        order.metodo_pago,
        null,
        false,
      );
    await connection.query(
      "UPDATE pedidos_viandas SET activo=0,estado='cancelado' WHERE id_pedido_vianda=? AND id_usuario=?",
      [req.params.id, req.usuario.id_usuario],
    );
    await syncSeries(connection, req.usuario.id_usuario, order.id_serie);
    await connection.commit();
    res.json({ ok: true, mensaje: "Entrega eliminada" });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
