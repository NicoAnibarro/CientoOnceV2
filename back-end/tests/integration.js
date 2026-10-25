require("dotenv").config();
const assert = require("node:assert/strict");
const app = require("../src/app");
const db = require("../src/config/db");

async function run() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const stamp = Date.now();
  let tokenA;
  let tokenB;

  async function request(path, { method = "GET", token, body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    return { status: response.status, json };
  }

  try {
    let response = await request("/health");
    assert.equal(response.status, 200);

    response = await request("/auth/register", {
      method: "POST",
      body: {
        nombre: "Prueba A",
        email: `prueba.a.${stamp}@local.test`,
        password: "secreto1",
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    tokenA = response.json.data.token;

    response = await request("/auth/register", {
      method: "POST",
      body: {
        nombre: "Duplicado",
        email: `prueba.a.${stamp}@local.test`,
        password: "secreto1",
      },
    });
    assert.equal(response.status, 409);
    response = await request("/auth/register", {
      method: "POST",
      body: {
        nombre: "Corta",
        email: `corta.${stamp}@local.test`,
        password: "123",
      },
    });
    assert.equal(response.status, 400);

    response = await request("/auth/register", {
      method: "POST",
      body: {
        nombre: "Prueba B",
        email: `prueba.b.${stamp}@local.test`,
        password: "secreto2",
      },
    });
    assert.equal(response.status, 201);
    tokenB = response.json.data.token;
    response = await request("/auth/login", {
      method: "POST",
      body: { email: `prueba.a.${stamp}@local.test`, password: "incorrecta" },
    });
    assert.equal(response.status, 401);
    response = await request("/auth/me", { token: tokenA });
    assert.equal(response.status, 200);
    response = await request("/configuracion-comercial/paleta-app", {
      method: "PATCH",
      token: tokenA,
      body: { paleta_app: "azul" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    response = await request("/configuracion-comercial/paleta-app", {
      token: tokenA,
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.data.paleta_app, "azul");

    response = await request("/tickets/analizar", { method: "POST" });
    assert.equal(response.status, 401);
    response = await request("/tickets/analizar", {
      method: "POST",
      token: tokenA,
    });
    assert.equal(response.status, 400);

    response = await request("/productos", {
      method: "POST",
      token: tokenA,
      body: {
        nombre: "Producto integración",
        descripcion: "",
        categoria: "dulce",
        costo_estimado: 100,
        precio_venta: 300,
        stock_actual: 2,
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    const idProducto = response.json.data.id_producto;
    response = await request("/productos", { token: tokenB });
    assert.equal(
      response.json.data.some((p) => p.id_producto === idProducto),
      false,
    );
    response = await request(`/productos/${idProducto}`, {
      method: "PUT",
      token: tokenB,
      body: {
        nombre: "Ataque",
        categoria: "dulce",
        costo_estimado: 0,
        precio_venta: 1,
        stock_actual: 0,
      },
    });
    assert.equal(response.status, 404);
    response = await request(`/stock/productos/${idProducto}`, {
      method: "POST",
      token: tokenA,
      body: { tipo: "establecer", cantidad: 0, motivo: "Prueba stock cero" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.data.stock_actual, 0);
    response = await request(`/stock/productos/${idProducto}`, {
      method: "POST",
      token: tokenA,
      body: { tipo: "establecer", cantidad: 2, motivo: "Restaurar prueba" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    response = await request(`/stock/productos/${idProducto}`, {
      method: "POST",
      token: tokenA,
      body: { tipo: "quitar", cantidad: 99, motivo: "Nunca negativo" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.data.stock_actual, 0);
    response = await request(`/stock/productos/${idProducto}`, {
      method: "POST",
      token: tokenA,
      body: { tipo: "establecer", cantidad: 2, motivo: "Restaurar prueba" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));

    response = await request("/clientes", {
      method: "POST",
      token: tokenA,
      body: {
        nombre: "Cliente integración",
        telefono: "123",
        direccion: "Calle prueba",
        latitud: -27.3671,
        longitud: -55.8961,
        ubicacion_origen: "mapa",
      },
    });
    assert.equal(response.status, 201);
    const idCliente = response.json.data.id_cliente;
    response = await request("/clientes", { token: tokenB });
    assert.equal(
      response.json.data.some((c) => c.id_cliente === idCliente),
      false,
    );

    response = await request("/repartos/pedidos", { token: tokenA });
    assert.equal(response.status, 200, JSON.stringify(response.json));

    response = await request("/insumos", {
      method: "POST",
      token: tokenA,
      body: {
        nombre: "Harina integración",
        descripcion: "",
        precio_referencia: 1200,
        cantidad_referencia: 1,
        unidad_referencia: "kg",
        tipo_medida: "peso",
        fecha_precio: "2026-07-20",
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    const idInsumo = response.json.data.id_insumo;
    response = await request(`/insumos/${idInsumo}`, {
      method: "PUT",
      token: tokenA,
      body: {
        nombre: "Harina integral integración",
        descripcion: "",
        precio_referencia: 1300,
        cantidad_referencia: 1,
        unidad_referencia: "kg",
        tipo_medida: "peso",
        fecha_precio: "2026-07-21",
      },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    response = await request("/insumos", {
      method: "POST",
      token: tokenA,
      body: {
        nombre: " harina integral integración ",
        descripcion: "",
        precio_referencia: 1200,
        cantidad_referencia: 1,
        unidad_referencia: "kg",
        tipo_medida: "peso",
        fecha_precio: "2026-07-20",
      },
    });
    assert.equal(response.status, 409);
    const [[testUser]] = await db.query(
      "SELECT id_usuario FROM usuarios WHERE email=?",
      [`prueba.a.${stamp}@local.test`],
    );
    const bulkPlaceholders = [];
    const supplyValues = [];
    for (let index = 1; index <= 105; index++) {
      bulkPlaceholders.push("(?,?,?,?,?,?,?,?)");
      supplyValues.push(
        testUser.id_usuario,
        `Insumo saturación ${String(index).padStart(3, "0")}`,
        "",
        1,
        1,
        "unidad",
        "unidad",
        "2026-07-20",
      );
    }
    await db.query(
      `INSERT INTO insumos(id_usuario,nombre,descripcion,precio_referencia,cantidad_referencia,unidad_referencia,tipo_medida,fecha_precio) VALUES ${bulkPlaceholders.join(",")}`,
      supplyValues,
    );
    response = await request("/insumos?limit=100&page=1", { token: tokenA });
    assert.equal(response.status, 200);
    assert.equal(response.json.data.length, 100);
    assert.equal(response.json.meta.total, 106);
    assert.equal(response.json.meta.total_pages, 2);
    response = await request("/insumos?all=true", { token: tokenA });
    assert.equal(response.status, 200);
    assert.equal(response.json.data.length, 106);

    response = await request("/pedidos", {
      method: "POST",
      token: tokenA,
      body: {
        id_cliente: idCliente,
        fecha_entrega: "2026-12-20",
        pagado: true,
        observaciones: "Prueba automática",
        detalles: [{ id_producto: idProducto, cantidad: 3 }],
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    assert.equal(response.json.data.total, 900);
    const idPedido = response.json.data.id_pedido;

    response = await request(
      "/repartos/pedidos?estado=pendiente&buscar=Cliente",
      { token: tokenA },
    );
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(
      response.json.data.some(
        (item) => item.id_pedido === idPedido && item.tiene_ubicacion,
      ),
      true,
    );
    response = await request("/repartos/pedidos", { token: tokenB });
    assert.equal(
      response.json.data.some((item) => item.id_pedido === idPedido),
      false,
    );

    response = await request(`/pedidos/${idPedido}`, { token: tokenA });
    assert.equal(response.json.data.detalles[0].cantidad_stock_descontada, 2);
    response = await request(`/pedidos/${idPedido}`, { token: tokenB });
    assert.equal(response.status, 404);
    response = await request("/productos", { token: tokenA });
    assert.equal(
      response.json.data.find((p) => p.id_producto === idProducto).stock_actual,
      0,
    );
    response = await request(`/pedidos/${idPedido}/estado`, {
      method: "PATCH",
      token: tokenA,
      body: { estado: "entregado" },
    });
    assert.equal(response.status, 200);
    response = await request(`/pedidos/${idPedido}`, { token: tokenA });
    assert.equal(response.json.data.detalles[0].cantidad_stock_descontada, 2);
    response = await request("/productos", { token: tokenA });
    assert.equal(
      response.json.data.find((p) => p.id_producto === idProducto).stock_actual,
      0,
    );
    response = await request(`/pedidos/${idPedido}/estado`, {
      method: "PATCH",
      token: tokenA,
      body: { estado: "pendiente" },
    });
    assert.equal(response.status, 200);
    response = await request("/productos", { token: tokenA });
    assert.equal(
      response.json.data.find((p) => p.id_producto === idProducto).stock_actual,
      0,
    );
    response = await request(`/pedidos/${idPedido}/estado`, {
      method: "PATCH",
      token: tokenA,
      body: { estado: "cancelado" },
    });
    assert.equal(response.status, 200);
    response = await request("/productos", { token: tokenA });
    assert.equal(
      response.json.data.find((p) => p.id_producto === idProducto).stock_actual,
      2,
    );
    response = await request(`/pedidos/${idPedido}/estado`, {
      method: "PATCH",
      token: tokenA,
      body: { estado: "entregado" },
    });
    assert.equal(response.status, 200);
    response = await request("/productos", { token: tokenA });
    assert.equal(
      response.json.data.find((p) => p.id_producto === idProducto).stock_actual,
      0,
    );

    response = await request(`/pedidos/${idPedido}/pagado`, {
      method: "PATCH",
      token: tokenA,
      body: { pagado: false },
    });
    assert.equal(response.status, 200);
    response = await request(`/pedidos/${idPedido}/pagado`, {
      method: "PATCH",
      token: tokenA,
      body: { pagado: true },
    });
    assert.equal(response.status, 200);
    response = await request("/caja", { token: tokenA });
    assert.equal(
      response.json.data.filter(
        (m) => m.origen === "pedido" && m.origen_id === idPedido,
      ).length,
      1,
    );

    response = await request("/compras", {
      method: "POST",
      token: tokenA,
      body: {
        proveedor: "Proveedor integración",
        fecha_compra: "2026-07-20",
        detalles: [{ id_insumo: idInsumo, cantidad: 2, precio_unitario: 1200 }],
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    assert.equal(response.json.data.total, 2400);
    response = await request("/caja/resumen", { token: tokenA });
    assert.equal(response.json.data.ingresos, 900);
    assert.equal(response.json.data.egresos, 2400);
    assert.equal(response.json.data.balance, -1500);
    response = await request("/caja/resumen", { token: tokenB });
    assert.deepEqual(response.json.data, {
      ingresos: 0,
      egresos: 0,
      balance: 0,
    });

    response = await request(`/pedidos/${idPedido}`, {
      method: "PUT",
      token: tokenA,
      body: {
        id_cliente: idCliente,
        fecha_entrega: "2026-12-21",
        estado: "entregado",
        pagado: true,
        detalles: [{ id_producto: idProducto, cantidad: 1 }],
      },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    response = await request("/productos", { token: tokenA });
    assert.equal(
      response.json.data.find((p) => p.id_producto === idProducto).stock_actual,
      1,
    );

    response = await request(`/pedidos/${idPedido}/desactivar`, {
      method: "PATCH",
      token: tokenA,
    });
    assert.equal(response.status, 200);
    response = await request("/productos", { token: tokenA });
    assert.equal(
      response.json.data.find((p) => p.id_producto === idProducto).stock_actual,
      2,
    );
    response = await request("/caja/resumen", { token: tokenA });
    assert.equal(response.json.data.ingresos, 0);
    assert.equal(response.json.data.egresos, 2400);
    assert.equal(response.json.data.balance, -2400);

    response = await request("/caja/movimientos", {
      method: "POST",
      token: tokenA,
      body: { tipo: "ingreso", monto: 5000, descripcion: "Capital inicial" },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    response = await request("/caja/movimientos", {
      method: "POST",
      token: tokenA,
      body: { tipo: "egreso", monto: 1000, descripcion: "Retiro personal" },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    response = await request("/caja/resumen", { token: tokenA });
    assert.equal(response.json.data.ingresos, 5000);
    assert.equal(response.json.data.egresos, 3400);
    assert.equal(response.json.data.balance, 1600);

    response = await request("/viandas/configuracion", { token: tokenA });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.data.tipos.length, 2);
    const idTipoVianda = response.json.data.tipos[0].id_tipo_vianda;
    response = await request("/viandas/configuracion", {
      method: "PUT",
      token: tokenA,
      body: { precio_postre: 500, precio_envio: 1000 },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    response = await request("/viandas", {
      method: "POST",
      token: tokenA,
      body: {
        id_cliente: idCliente,
        id_tipo_vianda: idTipoVianda,
        cantidad: 2,
        precio_unitario: 8000,
        con_postre: true,
        precio_postre_unitario: 500,
        con_envio: true,
        costo_envio: 1000,
        frecuencia: "diario",
        fecha_inicio: "2026-12-20",
        fecha_fin: "2026-12-22",
        hora_entrega: "12:30",
        descuento_tipo: "porcentaje",
        descuento_valor: 10,
        pagado: true,
        metodo_pago: "transferencia",
        estado: "pendiente",
        observaciones: "Sin cebolla",
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    assert.equal(response.json.data.cantidad_entregas, 3);
    const viandaIds = response.json.data.pedidos;
    response = await request(
      "/viandas?desde=2026-12-20&hasta=2026-12-22&limit=2",
      { token: tokenA },
    );
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.data.length, 2);
    assert.equal(response.json.meta.total, 3);
    assert.equal(Number(response.json.data[0].total), 16200);
    response = await request("/viandas", { token: tokenB });
    assert.equal(response.json.meta.total, 0);
    response = await request(
      "/repartos/viandas?desde=2026-12-20&hasta=2026-12-22",
      { token: tokenA },
    );
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.data.length, 3);
    assert.equal(
      response.json.data.every((item) => !!item.tiene_ubicacion),
      true,
    );
    response = await request(`/viandas/${viandaIds[0]}/estado`, {
      method: "PATCH",
      token: tokenA,
      body: { estado: "entregado" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    response = await request(`/viandas/${viandaIds[0]}/pagado`, {
      method: "PATCH",
      token: tokenA,
      body: { pagado: false },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    response = await request("/caja/resumen", { token: tokenA });
    assert.equal(response.json.data.ingresos, 37400);
    assert.equal(response.json.data.egresos, 3400);
    assert.equal(response.json.data.balance, 34000);
    response = await request(
      "/informes?buscar=Cliente&desde=2026-12-20&hasta=2026-12-22",
      { token: tokenA },
    );
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.data.viandas.length, 3);
    assert.equal(response.json.data.resumen.ventas_viandas, 16200);
    response = await request(`/viandas/${viandaIds[1]}/desactivar`, {
      method: "PATCH",
      token: tokenA,
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));

    response = await request("/costos-productos", {
      method: "POST",
      token: tokenA,
      body: {
        nombre: "Torta integración",
        costo_total: 300,
        detalles: [
          {
            id_insumo: idInsumo,
            insumo_nombre: "Harina integración",
            cantidad_usada: 250,
            unidad_usada: "g",
            subtotal: 300,
          },
        ],
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    const idCosto = response.json.data.id_costo_producto;
    response = await request("/costos-productos", { token: tokenA });
    assert.equal(
      response.json.data.some((item) => item.id_costo_producto === idCosto),
      true,
    );
    response = await request(`/costos-productos/${idCosto}`, {
      method: "PUT",
      token: tokenA,
      body: { nombre: "Torta editada", costo_total: 350, detalles: [] },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    response = await request("/costos-productos", { token: tokenA });
    assert.equal(
      response.json.data.find((item) => item.id_costo_producto === idCosto)
        .costo_total,
      350,
    );
    response = await request("/costos-productos", { token: tokenB });
    assert.equal(
      response.json.data.some((item) => item.id_costo_producto === idCosto),
      false,
    );
    response = await request(`/costos-productos/${idCosto}/desactivar`, {
      method: "PATCH",
      token: tokenA,
    });
    assert.equal(response.status, 200);

    let publicPage = await fetch(base + "/privacidad");
    assert.equal(publicPage.status, 200);
    assert.match(await publicPage.text(), /privacidad de Ciento Once/);
    publicPage = await fetch(base + "/eliminar-cuenta");
    assert.equal(publicPage.status, 200);

    response = await request("/auth/account", {
      method: "DELETE",
      token: tokenB,
      body: { password: "incorrecta", confirmacion: "ELIMINAR" },
    });
    assert.equal(response.status, 401);
    response = await request("/auth/account", {
      method: "DELETE",
      token: tokenB,
      body: { password: "secreto2", confirmacion: "ELIMINAR" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    response = await request("/auth/me", { token: tokenB });
    assert.equal(response.status, 401);

    console.log(
      "OK: autenticación, aislamiento, CRUD, listas extensas, stock, pedidos, pagos, compras, caja, viandas, rutas e informes",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
