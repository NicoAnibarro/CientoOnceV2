const db = require("../config/db");
const { numero, entero } = require("../utils/numeros");
const { unidadValida } = require("../utils/unidades");

const configs = {
  clientes: {
    id: "id_cliente",
    fields: [
      "nombre",
      "telefono",
      "direccion",
      "latitud",
      "longitud",
      "google_place_id",
      "ubicacion_origen",
      "instrucciones_entrega",
      "observacion",
    ],
    required: ["nombre"],
  },
  productos: {
    id: "id_producto",
    fields: [
      "nombre",
      "descripcion",
      "categoria",
      "costo_estimado",
      "precio_venta",
      "stock_actual",
    ],
    required: ["nombre", "categoria", "precio_venta"],
  },
  insumos: {
    id: "id_insumo",
    fields: [
      "nombre",
      "descripcion",
      "precio_referencia",
      "cantidad_referencia",
      "unidad_referencia",
      "tipo_medida",
      "fecha_precio",
    ],
    required: [
      "nombre",
      "precio_referencia",
      "cantidad_referencia",
      "unidad_referencia",
      "tipo_medida",
      "fecha_precio",
    ],
  },
};

function validar(tipo, body) {
  const config = configs[tipo];
  if (
    config.required.some(
      (key) => body[key] === undefined || String(body[key]).trim() === "",
    )
  )
    return "Completa los campos obligatorios";
  if (tipo === "clientes") {
    const hasLat =
      body.latitud !== undefined &&
      body.latitud !== null &&
      body.latitud !== "";
    const hasLng =
      body.longitud !== undefined &&
      body.longitud !== null &&
      body.longitud !== "";
    if (hasLat !== hasLng) return "La ubicación está incompleta";
    if (
      hasLat &&
      (!Number.isFinite(Number(body.latitud)) ||
        !Number.isFinite(Number(body.longitud)) ||
        Number(body.latitud) < -90 ||
        Number(body.latitud) > 90 ||
        Number(body.longitud) < -180 ||
        Number(body.longitud) > 180)
    )
      return "Coordenadas inválidas";
    if (
      body.ubicacion_origen &&
      !["manual", "busqueda", "mapa", "actual"].includes(body.ubicacion_origen)
    )
      return "Origen de ubicación inválido";
  }
  if (tipo === "productos") {
    const price = numero(body.precio_venta);
    const cost = numero(body.costo_estimado || 0);
    const stock =
      body.stock_actual === undefined ||
      body.stock_actual === null ||
      body.stock_actual === ""
        ? 0
        : Number(body.stock_actual);
    if (
      !String(body.categoria || "").trim() ||
      String(body.categoria).length > 80 ||
      price === null ||
      price < 0 ||
      cost === null ||
      cost < 0 ||
      !Number.isInteger(stock) ||
      stock < 0
    )
      return "Datos del producto inválidos";
  }
  if (tipo === "insumos") {
    const price = numero(body.precio_referencia);
    const quantity = numero(body.cantidad_referencia);
    if (
      price === null ||
      price < 0 ||
      quantity === null ||
      quantity <= 0 ||
      !unidadValida(body.tipo_medida, body.unidad_referencia)
    )
      return "Datos o unidades del insumo inválidos";
  }
  return null;
}

async function duplicateSupply(userId, name, ignoredId = null) {
  const args = [userId, String(name).trim()];
  let where =
    "id_usuario=? AND activo=1 AND LOWER(TRIM(nombre))=LOWER(TRIM(?))";
  if (ignoredId) {
    where += " AND id_insumo<>?";
    args.push(ignoredId);
  }
  const [[row]] = await db.query(
    `SELECT id_insumo,nombre FROM insumos WHERE ${where} LIMIT 1`,
    args,
  );
  return row || null;
}

exports.controller = (tipo) => ({
  list: async (req, res) => {
    const config = configs[tipo];
    const search = String(req.query.search || "").trim();
    const direction = req.query.orden === "za" ? "DESC" : "ASC";
    const all = req.query.all === "true";
    const page = Math.max(entero(Number(req.query.page)) || 1, 1);
    const limit = Math.min(
      Math.max(entero(Number(req.query.limit)) || 20, 1),
      100,
    );
    const args = [req.usuario.id_usuario, `%${search}%`];
    const where = "id_usuario=? AND activo=1 AND nombre LIKE ?";
    const [[count]] = await db.query(
      `SELECT COUNT(*) total FROM ${tipo} WHERE ${where}`,
      args,
    );
    const pagination = all ? "" : " LIMIT ? OFFSET ?";
    const queryArgs = all ? args : [...args, limit, (page - 1) * limit];
    const [rows] = await db.query(
      `SELECT * FROM ${tipo} WHERE ${where} ORDER BY nombre ${direction},${config.id} ASC${pagination}`,
      queryArgs,
    );
    res.json({
      ok: true,
      data: rows,
      meta: {
        page: all ? 1 : page,
        limit: all ? rows.length : limit,
        total: Number(count.total),
        total_pages: all
          ? 1
          : Math.max(1, Math.ceil(Number(count.total) / limit)),
      },
    });
  },
  create: async (req, res) => {
    const config = configs[tipo];
    const error = validar(tipo, req.body);
    if (error) return res.status(400).json({ ok: false, mensaje: error });
    if (
      tipo === "insumos" &&
      (await duplicateSupply(req.usuario.id_usuario, req.body.nombre))
    ) {
      return res
        .status(409)
        .json({
          ok: false,
          mensaje: "Ya existe un insumo activo con ese nombre",
        });
    }
    const values = config.fields.map((key) => req.body[key] ?? null);
    if (tipo === "productos") {
      if (values[2] === null) values[2] = "Dulce";
      if (values[5] === null) values[5] = 0;
    }
    const [result] = await db.query(
      `INSERT INTO ${tipo}(id_usuario,${config.fields.join(",")}) VALUES(?,${config.fields.map(() => "?").join(",")})`,
      [req.usuario.id_usuario, ...values],
    );
    res
      .status(201)
      .json({
        ok: true,
        mensaje: "Registro creado correctamente",
        data: { [config.id]: result.insertId },
      });
  },
  update: async (req, res) => {
    const config = configs[tipo];
    const error = validar(tipo, req.body);
    if (error) return res.status(400).json({ ok: false, mensaje: error });
    if (
      tipo === "insumos" &&
      (await duplicateSupply(
        req.usuario.id_usuario,
        req.body.nombre,
        Number(req.params.id),
      ))
    ) {
      return res
        .status(409)
        .json({
          ok: false,
          mensaje: "Ya existe otro insumo activo con ese nombre",
        });
    }
    const values = config.fields.map((key) => req.body[key] ?? null);
    const [result] = await db.query(
      `UPDATE ${tipo} SET ${config.fields.map((key) => `${key}=?`).join(",")} WHERE ${config.id}=? AND id_usuario=? AND activo=1`,
      [...values, req.params.id, req.usuario.id_usuario],
    );
    if (!result.affectedRows)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Registro no encontrado" });
    res.json({ ok: true, mensaje: "Registro actualizado" });
  },
  remove: async (req, res) => {
    const config = configs[tipo];
    const [result] = await db.query(
      `UPDATE ${tipo} SET activo=0 WHERE ${config.id}=? AND id_usuario=? AND activo=1`,
      [req.params.id, req.usuario.id_usuario],
    );
    if (!result.affectedRows)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Registro no encontrado" });
    res.json({ ok: true, mensaje: "Registro eliminado" });
  },
});
