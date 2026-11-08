// Base descartable local; nunca hereda credenciales ni destinos remotos.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
Object.assign(process.env, {
  DB_HOST: "127.0.0.1",
  DB_PORT: "55432",
  DB_USER: "postgres",
  DB_PASSWORD: "audit_local_only",
  DB_NAME: "ciento_once_audit",
  DB_SSL: "false",
  JWT_SECRET: "local-regression-secret",
  NODE_ENV: "test",
  REQUIRE_EMAIL_VERIFICATION: "false",
  EMAIL_DELIVERY_ENABLED: "false",
  DB_SCHEMA: `regression_${Date.now()}`,
});
delete process.env.DATABASE_URL;
const db = require("../src/config/db");
const app = require("../src/app");
let checks = 0;
const eq = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
};
async function main() {
  const schema = process.env.DB_SCHEMA;
  await db.rawPool.query(`CREATE SCHEMA ${schema}`);
  const setup = await db.rawPool.connect();
  try {
    await setup.query(`SET search_path TO ${schema},public`);
    await setup.query(
      fs.readFileSync(
        path.join(__dirname, "../../database/001_schema_postgresql.sql"),
        "utf8",
      ),
    );
    await setup.query("SET TIME ZONE 'America/Argentina/Buenos_Aires'");
  } finally {
    setup.release();
  }
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function req(route, method = "GET", body, token) {
    const response = await fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    const email = `regression.${Date.now()}@local.test`;
    let r = await req("/auth/register", "POST", {
      nombre: "Prueba",
      email,
      password: "test-password",
    });
    eq(r.status, 201, "Registro");
    const owner = r.body.data.token;
    const userId = (await req("/auth/me", "GET", undefined, owner)).body.data
      .id_usuario;
    const [[businessDay]] = await db.query(
      "SELECT TO_CHAR('2026-11-09T01:00:00Z'::timestamptz,'YYYY-MM-DD') dia",
    );
    eq(businessDay.dia, "2026-11-08", "Día comercial antes de medianoche");
    eq(
      (await req("/configuracion-comercial", "GET", undefined, owner)).status,
      200,
      "Configuración PostgreSQL",
    );
    const client = (await req("/clientes", "POST", { nombre: "Sara" }, owner))
      .body.data.id_cliente;
    const product = await req(
      "/productos",
      "POST",
      { nombre: "Producto", categoria: "Dulce", precio_venta: "12,50" },
      owner,
    );
    eq(product.status, 201, "Costo opcional y coma decimal");
    const productId = product.body.data.id_producto;
    let products = (await req("/productos", "GET", undefined, owner)).body.data;
    eq(
      [
        products[0].precio_venta,
        products[0].costo_estimado,
        products[0].stock_actual,
      ],
      [12.5, 0, 0],
      "Valores normalizados",
    );
    eq(
      (await req("/clientes", "POST", { nombre: null }, owner)).status,
      400,
      "Nombre nulo",
    );
    eq(
      (await req("/clientes", "POST", { nombre: "x".repeat(101) }, owner))
        .status,
      400,
      "Longitud",
    );
    const orderBody = {
      id_cliente: client,
      fecha_entrega: "2026-11-09",
      detalles: [{ id_producto: productId, cantidad: 2 }],
      pagado: true,
    };
    eq(
      (
        await req(
          "/pedidos",
          "POST",
          { ...orderBody, fecha_entrega: "2026-02-31" },
          owner,
        )
      ).status,
      400,
      "Fecha imposible",
    );
    const orderId = (await req("/pedidos", "POST", orderBody, owner)).body.data
      .id_pedido;
    await req(
      `/productos/${productId}`,
      "PUT",
      { nombre: "Producto", categoria: "Dulce", precio_venta: 100 },
      owner,
    );
    eq(
      (
        await req(
          `/pedidos/${orderId}`,
          "PUT",
          { ...orderBody, fecha_entrega: "2026-11-10" },
          owner,
        )
      ).status,
      200,
      "Editar fecha",
    );
    eq(
      (await req(`/pedidos/${orderId}`, "GET", undefined, owner)).body.data
        .total,
      25,
      "Preserva precio pactado",
    );
    await db.query(
      "UPDATE movimientos_caja SET fecha_movimiento='2026-11-01T12:00:00Z' WHERE id_usuario=? AND origen='pedido' AND origen_id=?",
      [userId, orderId],
    );
    await req(`/pedidos/${orderId}/pagado`, "PATCH", { pagado: true }, owner);
    let [[movement]] = await db.query(
      "SELECT fecha_movimiento FROM movimientos_caja WHERE id_usuario=? AND origen='pedido' AND origen_id=?",
      [userId, orderId],
    );
    eq(
      movement.fecha_movimiento.toISOString(),
      "2026-11-01T12:00:00.000Z",
      "Cobro idempotente conserva fecha",
    );
    const roles = {};
    for (const [role, pin] of [
      ["reparto", "4321"],
      ["ventas", "5432"],
      ["caja", "6543"],
    ]) {
      r = await req(
        "/empleados",
        "POST",
        { nombre: role, rol: role, pin },
        owner,
      );
      eq(r.status, 201, "Crear empleado " + role);
      const id = r.body.data.id_empleado;
      r = await req("/auth/employee-login", "POST", { email, pin });
      roles[role] = { token: r.body.data.token, id };
    }
    eq(
      (
        await req(
          "/empleados",
          "POST",
          { nombre: "Duplicado", pin: "5432" },
          owner,
        )
      ).status,
      409,
      "PIN repetido",
    );
    eq(
      (
        await req(
          "/empleados",
          "POST",
          { nombre: "Inválido", pin: "abcd" },
          owner,
        )
      ).status,
      400,
      "PIN no numérico",
    );
    const concurrentPins = await Promise.all(
      ["Uno", "Dos"].map((nombre) =>
        req("/empleados", "POST", { nombre, pin: "7654" }, owner),
      ),
    );
    eq(
      concurrentPins.map((x) => x.status).sort(),
      [201, 409],
      "PIN único con creación concurrente",
    );
    for (const route of [
      "/caja",
      "/caja/resumen",
      "/compras",
      "/insumos",
      "/costos-productos",
      "/stock",
    ])
      eq(
        (await req(route, "GET", undefined, roles.reparto.token)).status,
        403,
        "Sin acceso financiero: " + route,
      );
    const dashboard = (
      await req("/dashboard", "GET", undefined, roles.reparto.token)
    ).body.data;
    eq(
      dashboard.resumen.balance_caja,
      undefined,
      "Dashboard reparto no expone balance",
    );
    eq(
      dashboard.resumen.ventas_hoy,
      undefined,
      "Dashboard reparto no expone ventas",
    );
    const category = (
      await req("/categorias-productos", "POST", { nombre: "Temporal" }, owner)
    ).body.data.id_categoria;
    await req(
      `/categorias-productos/${category}/desactivar`,
      "PATCH",
      {},
      owner,
    );
    eq(
      (
        await req(
          "/categorias-productos",
          "POST",
          { nombre: "Temporal" },
          owner,
        )
      ).status,
      201,
      "Reactivar categoría",
    );
    const config = (
      await req("/viandas/configuracion", "GET", undefined, owner)
    ).body.data;
    const mealBody = {
      id_cliente: client,
      id_tipo_vianda: config.tipos[0].id_tipo_vianda,
      cantidad: 1,
      precio_unitario: 100,
      frecuencia: "diario",
      fecha_inicio: "2026-11-09",
      fecha_fin: "2026-11-27",
      dias_semana: [1, 2, 3, 4, 5],
      hora_entrega: "12:00",
      pagado: false,
    };
    r = await req("/viandas", "POST", mealBody, owner);
    eq(r.status, 201, "Plan");
    const ids = r.body.data.pedidos;
    eq(ids.length, 15, "Quince días");
    const seriesId = r.body.data.id_serie;
    const batchRoute = `/viandas/clientes/${client}/cambios`;
    const changes = ids.map((id, i) => ({
      id_pedido_vianda: id,
      estado: "entregado",
      estado_anterior: "pendiente",
      ...(i < 10
        ? { pagado: true, pagado_anterior: false, fecha_pago: "2026-11-08" }
        : {}),
    }));
    const before = (
      await req(`/viandas/clientes/${client}`, "GET", undefined, owner)
    ).body.data.series[0].entregas.map((x) => x.id_pedido_vianda);
    r = await req(batchRoute, "PATCH", { cambios: changes }, owner);
    eq(r.status, 200, "Aplicar 15 días de una sola vez");
    eq(
      r.body.data.entregas.filter((x) => x.estado === "entregado").length,
      15,
      "Todas entregadas",
    );
    eq(
      r.body.data.entregas.filter((x) => x.pagado).length,
      10,
      "Solo diez cobradas",
    );
    eq(r.body.data.series[0].monto_pagado, 1000, "Caja sincronizada");
    eq(
      (
        await req(`/viandas/clientes/${client}`, "GET", undefined, owner)
      ).body.data.series[0].entregas.map((x) => x.id_pedido_vianda),
      before,
      "Orden estable",
    );
    const datesBefore = await db.query(
      "SELECT fecha_movimiento FROM movimientos_caja WHERE id_usuario=? AND origen='vianda' ORDER BY origen_id",
      [userId],
    );
    eq(
      (await req(batchRoute, "PATCH", { cambios: changes }, owner)).status,
      200,
      "Reintento del mismo lote",
    );
    const datesAfter = await db.query(
      "SELECT fecha_movimiento FROM movimientos_caja WHERE id_usuario=? AND origen='vianda' ORDER BY origen_id",
      [userId],
    );
    eq(datesAfter[0], datesBefore[0], "Reintento conserva fechas y no duplica");
    const otherOwner = (
      await req("/auth/register", "POST", {
        nombre: "Otro comercio",
        email: `other.${Date.now()}@local.test`,
        password: "other-password",
      })
    ).body.data.token;
    eq(
      (
        await req(
          batchRoute,
          "PATCH",
          { cambios: [{ id_pedido_vianda: ids[0], pagado: false }] },
          otherOwner,
        )
      ).status,
      404,
      "Otro comercio no modifica el lote",
    );
    const rollback = await req(
      batchRoute,
      "PATCH",
      {
        cambios: [
          { id_pedido_vianda: ids[0], estado: "pendiente" },
          { id_pedido_vianda: ids[1], estado: "cancelado", pagado: true },
        ],
      },
      owner,
    );
    eq(rollback.status, 409, "Falla un elemento del lote");
    let [[delivery]] = await db.query(
      "SELECT estado FROM pedidos_viandas WHERE id_pedido_vianda=?",
      [ids[0]],
    );
    eq(delivery.estado, "entregado", "Rollback completo");
    eq(
      (
        await req(
          batchRoute,
          "PATCH",
          { cambios: [{ id_pedido_vianda: ids[0], pagado: false }] },
          roles.reparto.token,
        )
      ).status,
      403,
      "Reparto no cobra ni revierte",
    );
    eq(
      (
        await req(
          batchRoute,
          "PATCH",
          { cambios: [{ id_pedido_vianda: ids[0], estado: "pendiente" }] },
          roles.caja.token,
        )
      ).status,
      403,
      "Caja no cambia entrega",
    );
    eq(
      (
        await req(
          batchRoute,
          "PATCH",
          {
            cambios: [
              {
                id_pedido_vianda: ids[14],
                estado: "pendiente",
                estado_anterior: "cancelado",
              },
            ],
          },
          owner,
        )
      ).status,
      409,
      "Conflicto de estado",
    );
    eq(
      (
        await req(
          batchRoute,
          "PATCH",
          { cambios: [{ id_pedido_vianda: ids[14], estado: "pendiente" }] },
          roles.reparto.token,
        )
      ).status,
      200,
      "Reparto sí cambia entrega",
    );
    eq(
      (
        await req(
          batchRoute,
          "PATCH",
          { cambios: [{ id_pedido_vianda: ids[14], pagado: true }] },
          roles.caja.token,
        )
      ).status,
      200,
      "Caja sí cobra",
    );
    const paidList = (
      await req("/viandas?pagado=true&limit=100", "GET", undefined, owner)
    ).body.data;
    eq(paidList.length, 11, "Filtro por pago de entrega");
    eq(
      paidList.every((row) => row.pagado === 1),
      true,
      "Filtro no mezcla pendientes",
    );
    await req(
      `/viandas/${ids[13]}/estado`,
      "PATCH",
      { estado: "cancelado" },
      owner,
    );
    let [[series]] = await db.query(
      "SELECT total_plan,monto_pagado FROM series_viandas WHERE id_serie=?",
      [seriesId],
    );
    eq(series.total_plan, 1400, "Cancelación reduce deuda");
    await req(
      `/viandas/${ids[13]}/estado`,
      "PATCH",
      { estado: "pendiente" },
      owner,
    );
    [[series]] = await db.query(
      "SELECT total_plan FROM series_viandas WHERE id_serie=?",
      [seriesId],
    );
    eq(series.total_plan, 1500, "Reactivación restaura deuda");
    const otherClient = (
      await req("/clientes", "POST", { nombre: "Otro cliente" }, owner)
    ).body.data.id_cliente;
    eq(
      (
        await req(
          `/viandas/${ids[0]}`,
          "PUT",
          { ...mealBody, id_cliente: otherClient, fecha_entrega: "2026-11-09" },
          owner,
        )
      ).status,
      409,
      "No mezcla clientes del plan",
    );
    eq(
      (
        await req(
          `/viandas/clientes/${otherClient}/cambios`,
          "PATCH",
          { cambios: [{ id_pedido_vianda: ids[0], pagado: false }] },
          owner,
        )
      ).status,
      404,
      "Aislamiento entre clientes",
    );
    await req(
      `/pedidos/${orderId}/estado`,
      "PATCH",
      { estado: "entregado" },
      owner,
    );
    const report = (
      await req(
        "/informes?desde=2030-01-01&hasta=2030-01-02",
        "GET",
        undefined,
        owner,
      )
    ).body.data;
    eq(report.top_productos, [], "Rankings respetan fechas");
    await req(`/empleados/${roles.reparto.id}/desactivar`, "PATCH", {}, owner);
    eq(
      (await req("/auth/me", "GET", undefined, roles.reparto.token)).status,
      401,
      "Desactivación revoca sesión",
    );
    const hash = (value) =>
      crypto.createHash("sha256").update(value).digest("hex");
    await db.query(
      "INSERT INTO tokens_autenticacion(id_usuario,proposito,token_hash,codigo_hash,vence_en) VALUES(?,'recuperar_password',?,?,NOW()+INTERVAL '30 minutes')",
      [userId, hash("token"), hash("123456")],
    );
    for (let i = 0; i < 8; i++)
      eq(
        (
          await req("/auth/reset-password", "POST", {
            email,
            codigo: "000000",
            password: "new-password",
          })
        ).status,
        400,
        "Código incorrecto",
      );
    const [[attempts]] = await db.query(
      "SELECT intentos FROM tokens_autenticacion WHERE id_usuario=?",
      [userId],
    );
    eq(attempts.intentos, 8, "Guarda intentos fallidos");
    eq(
      (
        await req("/auth/reset-password", "POST", {
          email,
          codigo: "123456",
          password: "new-password",
        })
      ).status,
      400,
      "Código bloqueado al octavo intento",
    );
    process.env.NODE_ENV = "production";
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    eq(
      (
        await req("/auth/register", "POST", {
          nombre: "Sin atajos",
          email: `production.${Date.now()}@local.test`,
          password: "test-password",
        })
      ).status,
      503,
      "Local.test no evita verificación en producción",
    );
    console.log(
      `OK: ${checks} comprobaciones de regresión, permisos, contabilidad y cambios de viandas en lote`,
    );
  } finally {
    await new Promise((r) => server.close(r));
    await db.rawPool.query(`DROP SCHEMA ${schema} CASCADE`);
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
