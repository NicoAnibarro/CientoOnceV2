const { randomUUID } = require("node:crypto");
const db = require("../config/db");
const { numero, entero } = require("../utils/numeros");
const { fechaValida } = require("../utils/fechas");

const PAYMENT_METHODS = ["efectivo", "transferencia", "qr", "tarjeta", "mixto"];
const FREQUENCIES = ["unico", "diario", "semanal", "mensual"];
const STATES = ["pendiente", "entregado", "cancelado"];

const paymentMethod = (value) =>
  PAYMENT_METHODS.includes(value) ? value : "efectivo";
const booleanValue = (value) => value === true || value === 1 || value === "1";
const dateText = (date) => date.toISOString().slice(0, 10);

function calculateDiscount(subtotal, body) {
  const type = body.descuento_tipo || null;
  const value = numero(body.descuento_valor || 0) || 0;
  if (!type || value === 0)
    return { type: null, value: 0, amount: 0, total: subtotal };
  if (
    !["porcentaje", "fijo"].includes(type) ||
    value < 0 ||
    (type === "porcentaje" && value > 100)
  ) {
    throw Object.assign(new Error("Descuento inválido"), { status: 400 });
  }
  const amount = Number(
    (type === "porcentaje" ? (subtotal * value) / 100 : value).toFixed(2),
  );
  if (amount > subtotal)
    throw Object.assign(
      new Error("El descuento no puede superar el subtotal"),
      { status: 400 },
    );
  return { type, value, amount, total: Number((subtotal - amount).toFixed(2)) };
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
      { status: 400 },
    );
  if ((end - start) / 86400000 > 730)
    throw Object.assign(new Error("El plan no puede superar dos años"), {
      status: 400,
    });
  if (normalizedFrequency === "unico") return [startText];
  const dates = [];
  if (normalizedFrequency === "mensual") {
    const desiredDay = start.getUTCDate();
    for (let year = start.getUTCFullYear(), month = start.getUTCMonth(); ;) {
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const candidate = new Date(
        Date.UTC(year, month, Math.min(desiredDay, lastDay), 12),
      );
      if (candidate > end) break;
      if (candidate >= start) dates.push(dateText(candidate));
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
  } else {
    const selectedDays = new Set(
      (Array.isArray(weekDays) ? weekDays : [])
        .map(Number)
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    );
    if (normalizedFrequency === "semanal" && !selectedDays.size)
      selectedDays.add(start.getUTCDay());
    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      if (
        normalizedFrequency === "diario" ||
        selectedDays.has(cursor.getUTCDay())
      )
        dates.push(dateText(cursor));
    }
  }
  if (!dates.length)
    throw Object.assign(new Error("La recurrencia no genera ninguna entrega"), {
      status: 400,
    });
  if (dates.length > 366)
    throw Object.assign(
      new Error("El plan genera demasiadas entregas; acorta el rango"),
      { status: 400 },
    );
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

async function cashMovement(connection, userId, orderId, total, paid, method) {
  if (paid) {
    await connection.query(
      `INSERT INTO movimientos_caja
      (id_usuario,tipo,categoria,concepto,monto,metodo_pago,origen,origen_id,anulado)
      VALUES(?,'ingreso','pedido',?,?,?,'vianda',?,0)
      ON DUPLICATE KEY UPDATE monto=VALUES(monto),metodo_pago=VALUES(metodo_pago),anulado=0`,
      [
        userId,
        `Pago de vianda #${orderId}`,
        total,
        paymentMethod(method),
        orderId,
      ],
    );
  } else {
    await connection.query(
      "UPDATE movimientos_caja SET anulado=1 WHERE id_usuario=? AND origen='vianda' AND origen_id=?",
      [userId, orderId],
    );
  }
}

async function orderValues(connection, userId, body) {
  const [[client]] = await connection.query(
    "SELECT * FROM clientes WHERE id_cliente=? AND id_usuario=? AND activo=1",
    [body.id_cliente, userId],
  );
  if (!client)
    throw Object.assign(new Error("Cliente no encontrado"), { status: 404 });
  const [[type]] = await connection.query(
    "SELECT * FROM tipos_vianda WHERE id_tipo_vianda=? AND id_usuario=? AND activo=1",
    [body.id_tipo_vianda, userId],
  );
  if (!type)
    throw Object.assign(new Error("Tipo de vianda no encontrado"), {
      status: 404,
    });
  const quantity = entero(Number(body.cantidad));
  const unitPrice = numero(body.precio_unitario ?? type.precio_base);
  const dessert = booleanValue(body.con_postre);
  const dessertPrice = dessert ? numero(body.precio_postre_unitario || 0) : 0;
  const shipping = booleanValue(body.con_envio);
  const shippingPrice = shipping ? numero(body.costo_envio || 0) : 0;
  if (
    !quantity ||
    quantity < 1 ||
    quantity > 999 ||
    unitPrice === null ||
    unitPrice < 0 ||
    dessertPrice === null ||
    dessertPrice < 0 ||
    shippingPrice === null ||
    shippingPrice < 0
  ) {
    throw Object.assign(new Error("Cantidad o importes inválidos"), {
      status: 400,
    });
  }
  const subtotal = Number(
    ((unitPrice + dessertPrice) * quantity + shippingPrice).toFixed(2),
  );
  const discount = calculateDiscount(subtotal, body);
  return {
    client,
    type,
    quantity,
    unitPrice,
    dessert,
    dessertPrice,
    shipping,
    shippingPrice,
    subtotal,
    discount,
  };
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
    return res
      .status(400)
      .json({
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
    return res
      .status(400)
      .json({ ok: false, mensaje: "Nombre o precio inválido" });
  try {
    const [result] = await db.query(
      "INSERT INTO tipos_vianda(id_usuario,nombre,precio_base) VALUES(?,?,?)",
      [req.usuario.id_usuario, name, price],
    );
    res
      .status(201)
      .json({
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
    "SELECT COUNT(*) cantidad FROM pedidos_viandas WHERE id_tipo_vianda=? AND id_usuario=? AND activo=1",
    [req.params.id, req.usuario.id_usuario],
  );
  if (Number(usage.cantidad))
    return res
      .status(409)
      .json({
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
    `SELECT COUNT(*) total FROM pedidos_viandas v WHERE ${where}`,
    args,
  );
  const [rows] = await db.query(
    `SELECT v.*,s.frecuencia,c.latitud,c.longitud,c.google_place_id,
      (c.latitud IS NOT NULL AND c.longitud IS NOT NULL) tiene_ubicacion
    FROM pedidos_viandas v
    JOIN series_viandas s ON s.id_serie=v.id_serie AND s.id_usuario=v.id_usuario
    LEFT JOIN clientes c ON c.id_cliente=v.id_cliente AND c.id_usuario=v.id_usuario
    WHERE ${where}
    ORDER BY v.estado='pendiente' DESC,v.fecha_entrega ASC,v.hora_entrega ASC,v.id_pedido_vianda ASC
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
    await connection.query(
      "INSERT INTO series_viandas(id_serie,id_usuario,frecuencia,fecha_inicio,fecha_fin,dias_semana_json) VALUES(?,?,?,?,?,?)",
      [
        seriesId,
        userId,
        frequency,
        dates[0],
        dates.at(-1),
        frequency === "semanal"
          ? JSON.stringify(req.body.dias_semana || [])
          : null,
      ],
    );
    const paid = booleanValue(req.body.pagado);
    const state = req.body.estado === "entregado" ? "entregado" : "pendiente";
    const method = paymentMethod(req.body.metodo_pago);
    const ids = [];
    for (const deliveryDate of dates) {
      const [result] = await connection.query(
        `INSERT INTO pedidos_viandas
        (id_usuario,id_serie,id_cliente,cliente_nombre,cliente_telefono,cliente_direccion,id_tipo_vianda,tipo_nombre,cantidad,precio_unitario,
         con_postre,precio_postre_unitario,con_envio,costo_envio,subtotal,descuento_tipo,descuento_valor,descuento_importe,total,
         fecha_entrega,hora_entrega,estado,pagado,fecha_pago,metodo_pago,observaciones)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,IF(?=1,NOW(),NULL),?,?)`,
        [
          userId,
          seriesId,
          values.client.id_cliente,
          values.client.nombre,
          values.client.telefono,
          values.client.direccion,
          values.type.id_tipo_vianda,
          values.type.nombre,
          values.quantity,
          values.unitPrice,
          values.dessert ? 1 : 0,
          values.dessertPrice,
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
          paid ? 1 : 0,
          paid ? 1 : 0,
          method,
          String(req.body.observaciones || "").trim() || null,
        ],
      );
      ids.push(result.insertId);
      await cashMovement(
        connection,
        userId,
        result.insertId,
        values.discount.total,
        paid,
        method,
      );
    }
    await connection.commit();
    res
      .status(201)
      .json({
        ok: true,
        mensaje:
          dates.length === 1
            ? "Pedido de vianda creado"
            : `${dates.length} entregas programadas`,
        data: {
          id_serie: seriesId,
          pedidos: ids,
          cantidad_entregas: dates.length,
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
      "SELECT * FROM pedidos_viandas WHERE id_pedido_vianda=? AND id_usuario=? AND activo=1 FOR UPDATE",
      [req.params.id, userId],
    );
    if (!current)
      throw Object.assign(new Error("Pedido de vianda no encontrado"), {
        status: 404,
      });
    if (
      !fechaValida(req.body.fecha_entrega) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(req.body.hora_entrega || ""))
    )
      throw Object.assign(new Error("Fecha u hora inválida"), { status: 400 });
    const values = await orderValues(connection, userId, req.body);
    const state = STATES.includes(req.body.estado)
      ? req.body.estado
      : current.estado;
    const paid = booleanValue(req.body.pagado);
    const method = paymentMethod(req.body.metodo_pago || current.metodo_pago);
    await connection.query(
      `UPDATE pedidos_viandas SET id_cliente=?,cliente_nombre=?,cliente_telefono=?,cliente_direccion=?,id_tipo_vianda=?,tipo_nombre=?,cantidad=?,precio_unitario=?,
      con_postre=?,precio_postre_unitario=?,con_envio=?,costo_envio=?,subtotal=?,descuento_tipo=?,descuento_valor=?,descuento_importe=?,total=?,fecha_entrega=?,hora_entrega=?,
      estado=?,pagado=?,fecha_pago=IF(?=1,COALESCE(fecha_pago,NOW()),NULL),metodo_pago=?,observaciones=? WHERE id_pedido_vianda=? AND id_usuario=?`,
      [
        values.client.id_cliente,
        values.client.nombre,
        values.client.telefono,
        values.client.direccion,
        values.type.id_tipo_vianda,
        values.type.nombre,
        values.quantity,
        values.unitPrice,
        values.dessert ? 1 : 0,
        values.dessertPrice,
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
        paid ? 1 : 0,
        paid ? 1 : 0,
        method,
        String(req.body.observaciones || "").trim() || null,
        req.params.id,
        userId,
      ],
    );
    await cashMovement(
      connection,
      userId,
      req.params.id,
      values.discount.total,
      paid,
      method,
    );
    await connection.commit();
    res.json({ ok: true, mensaje: "Pedido de vianda actualizado" });
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
    return res
      .status(404)
      .json({ ok: false, mensaje: "Pedido de vianda no encontrado" });
  const [[row]] = await db.query(
    "SELECT id_pedido_vianda,estado,pagado,fecha_actualizacion FROM pedidos_viandas WHERE id_pedido_vianda=? AND id_usuario=?",
    [req.params.id, req.usuario.id_usuario],
  );
  res.json({ ok: true, mensaje: "Estado actualizado", data: row });
};

exports.paid = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.usuario.id_usuario;
    const [[order]] = await connection.query(
      "SELECT total,metodo_pago FROM pedidos_viandas WHERE id_pedido_vianda=? AND id_usuario=? AND activo=1 FOR UPDATE",
      [req.params.id, userId],
    );
    if (!order)
      throw Object.assign(new Error("Pedido de vianda no encontrado"), {
        status: 404,
      });
    const paid = booleanValue(req.body.pagado);
    const method = paymentMethod(req.body.metodo_pago || order.metodo_pago);
    await connection.query(
      "UPDATE pedidos_viandas SET pagado=?,metodo_pago=?,fecha_pago=IF(?=1,COALESCE(fecha_pago,NOW()),NULL) WHERE id_pedido_vianda=? AND id_usuario=?",
      [paid ? 1 : 0, method, paid ? 1 : 0, req.params.id, userId],
    );
    await cashMovement(
      connection,
      userId,
      req.params.id,
      order.total,
      paid,
      method,
    );
    const [[row]] = await connection.query(
      "SELECT id_pedido_vianda,estado,pagado,metodo_pago,fecha_pago,fecha_actualizacion FROM pedidos_viandas WHERE id_pedido_vianda=? AND id_usuario=?",
      [req.params.id, userId],
    );
    await connection.commit();
    res.json({ ok: true, mensaje: "Pago actualizado", data: row });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.remove = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      "UPDATE pedidos_viandas SET activo=0 WHERE id_pedido_vianda=? AND id_usuario=? AND activo=1",
      [req.params.id, req.usuario.id_usuario],
    );
    if (!result.affectedRows)
      throw Object.assign(new Error("Pedido de vianda no encontrado"), {
        status: 404,
      });
    await cashMovement(
      connection,
      req.usuario.id_usuario,
      req.params.id,
      0,
      false,
      "efectivo",
    );
    await connection.commit();
    res.json({ ok: true, mensaje: "Pedido de vianda eliminado" });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
