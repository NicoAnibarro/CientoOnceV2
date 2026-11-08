require("dotenv").config();
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const app = require("../src/app");
const db = require("../src/config/db");

const TOTAL = 1500;
const ORDERS = 1200;
const SERIES = 100;
const DELIVERIES_PER_SERIES = 12;

function placeholders(rows, columns) {
  return Array.from(
    { length: rows },
    () => `(${Array(columns).fill("?").join(",")})`,
  ).join(",");
}

async function run() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const stamp = Date.now();
  const request = async (path, { method = "GET", token, body } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, json: await response.json() };
  };

  try {
    let response = await request("/auth/register", {
      method: "POST",
      body: {
        nombre: "Prueba de carga",
        email: `stress.${stamp}@local.test`,
        password: "secreto-carga",
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    const token = response.json.data.token;
    response = await request("/auth/me", { token });
    const userId = response.json.data.id_usuario;

    for (let offset = 0; offset < TOTAL; offset += 500) {
      const size = Math.min(500, TOTAL - offset);
      const clients = [];
      const products = [];
      const supplies = [];
      for (let index = 0; index < size; index += 1) {
        const number = offset + index + 1;
        clients.push(
          userId,
          `Cliente carga ${String(number).padStart(4, "0")}`,
          `3764${number}`,
          `Calle ${number}`,
          1,
        );
        products.push(
          userId,
          `Producto carga ${String(number).padStart(4, "0")}`,
          "dulce",
          100,
          250,
          number % 20,
          1,
        );
        supplies.push(
          userId,
          `Insumo carga ${String(number).padStart(4, "0")}`,
          100,
          1000,
          "g",
          "peso",
          "2026-11-06",
          1,
        );
      }
      await db.query(
        `INSERT INTO clientes(id_usuario,nombre,telefono,direccion,activo) VALUES ${placeholders(size, 5)}`,
        clients,
      );
      await db.query(
        `INSERT INTO productos(id_usuario,nombre,categoria,costo_estimado,precio_venta,stock_actual,activo) VALUES ${placeholders(size, 7)}`,
        products,
      );
      await db.query(
        `INSERT INTO insumos(id_usuario,nombre,precio_referencia,cantidad_referencia,unidad_referencia,tipo_medida,fecha_precio,activo) VALUES ${placeholders(size, 8)}`,
        supplies,
      );
    }

    const [[client]] = await db.query(
      "SELECT id_cliente,nombre,telefono,direccion FROM clientes WHERE id_usuario=? ORDER BY id_cliente LIMIT 1",
      [userId],
    );
    const [[product]] = await db.query(
      "SELECT id_producto,nombre,precio_venta FROM productos WHERE id_usuario=? ORDER BY id_producto LIMIT 1",
      [userId],
    );
    const orderValues = [];
    for (let index = 0; index < ORDERS; index += 1) {
      const paid = index % 2;
      orderValues.push(
        userId,
        client.id_cliente,
        client.nombre,
        client.telefono,
        client.direccion,
        "2026-12-20",
        "pendiente",
        paid,
        paid ? "2026-11-06 12:00:00" : null,
        "efectivo",
        250,
        250,
        1,
      );
    }
    const [ordersResult] = await db.query(
      `INSERT INTO pedidos(id_usuario,id_cliente,cliente_nombre,cliente_telefono,cliente_direccion,
       fecha_entrega,estado,pagado,fecha_pago,metodo_pago,subtotal,total,activo)
       VALUES ${placeholders(ORDERS, 13)}`,
      orderValues,
    );
    const firstOrderId = Number(ordersResult.insertId);
    const detailValues = [];
    const cashValues = [];
    for (let index = 0; index < ORDERS; index += 1) {
      const orderId = firstOrderId + index;
      detailValues.push(
        userId,
        orderId,
        product.id_producto,
        product.nombre,
        250,
        1,
        250,
        0,
      );
      if (index % 2)
        cashValues.push(
          userId,
          "ingreso",
          "pedido",
          `Pago carga #${orderId}`,
          250,
          "efectivo",
          "pedido",
          orderId,
          0,
        );
    }
    await db.query(
      `INSERT INTO pedido_detalles(id_usuario,id_pedido,id_producto,producto_nombre,precio_unitario,cantidad,subtotal,cantidad_stock_descontada)
       VALUES ${placeholders(ORDERS, 8)}`,
      detailValues,
    );
    await db.query(
      `INSERT INTO movimientos_caja(id_usuario,tipo,categoria,concepto,monto,metodo_pago,origen,origen_id,anulado)
       VALUES ${placeholders(cashValues.length / 9, 9)}`,
      cashValues,
    );

    const [typeResult] = await db.query(
      "INSERT INTO tipos_vianda(id_usuario,nombre,precio_base) VALUES(?,'Vianda carga',100)",
      [userId],
    );
    const typeId = typeResult.insertId;
    const seriesValues = [];
    const seriesIds = [];
    for (let index = 0; index < SERIES; index += 1) {
      const id = randomUUID();
      seriesIds.push(id);
      seriesValues.push(
        id,
        userId,
        client.id_cliente,
        client.nombre,
        client.telefono,
        client.direccion,
        "diario",
        "2026-11-09",
        "2026-11-24",
        "efectivo",
        1200,
        600,
        0,
        1,
      );
    }
    await db.query(
      `INSERT INTO series_viandas(id_serie,id_usuario,id_cliente,cliente_nombre,cliente_telefono,cliente_direccion,
       frecuencia,fecha_inicio,fecha_fin,metodo_pago,total_plan,monto_pagado,pagado,activo)
       VALUES ${placeholders(SERIES, 14)}`,
      seriesValues,
    );
    const deliveryValues = [];
    for (const seriesId of seriesIds)
      for (let day = 0; day < DELIVERIES_PER_SERIES; day += 1) {
        const date = new Date(Date.UTC(2026, 10, 9 + day));
        deliveryValues.push(
          userId,
          seriesId,
          client.id_cliente,
          client.nombre,
          client.telefono,
          client.direccion,
          typeId,
          "Vianda carga",
          1,
          100,
          100,
          100,
          date.toISOString().slice(0, 10),
          "12:30:00",
          "pendiente",
          day < 6 ? 1 : 0,
          day < 6 ? "2026-11-06 12:00:00" : null,
          "efectivo",
          1,
        );
      }
    const [deliveryResult] = await db.query(
      `INSERT INTO pedidos_viandas(id_usuario,id_serie,id_cliente,cliente_nombre,cliente_telefono,cliente_direccion,
       id_tipo_vianda,tipo_nombre,cantidad,precio_unitario,subtotal,total,fecha_entrega,hora_entrega,estado,pagado,fecha_pago,metodo_pago,activo)
       VALUES ${placeholders(SERIES * DELIVERIES_PER_SERIES, 19)}`,
      deliveryValues,
    );
    const firstDeliveryId = Number(deliveryResult.insertId);
    const paymentValues = [];
    for (let seriesIndex = 0; seriesIndex < SERIES; seriesIndex += 1)
      for (let day = 0; day < 6; day += 1) {
        const deliveryId =
          firstDeliveryId + seriesIndex * DELIVERIES_PER_SERIES + day;
        paymentValues.push(
          userId,
          seriesIds[seriesIndex],
          deliveryId,
          100,
          "efectivo",
          "2026-11-06 12:00:00",
          1,
        );
      }
    const [paymentResult] = await db.query(
      `INSERT INTO pagos_viandas(id_usuario,id_serie,id_pedido_vianda,monto,metodo_pago,fecha_pago,activo)
       VALUES ${placeholders(paymentValues.length / 7, 7)}`,
      paymentValues,
    );
    const firstPaymentId = Number(paymentResult.insertId);
    const viandaCash = [];
    for (let index = 0; index < paymentValues.length / 7; index += 1)
      viandaCash.push(
        userId,
        "ingreso",
        "pedido",
        `Cobro vianda carga ${index + 1}`,
        100,
        "efectivo",
        "vianda",
        firstPaymentId + index,
        0,
      );
    await db.query(
      `INSERT INTO movimientos_caja(id_usuario,tipo,categoria,concepto,monto,metodo_pago,origen,origen_id,anulado)
       VALUES ${placeholders(viandaCash.length / 9, 9)}`,
      viandaCash,
    );

    response = await request("/clientes?limit=8&page=188", { token });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.meta.total, TOTAL);
    response = await request("/productos?limit=100&page=15", { token });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.meta.total, TOTAL);
    assert.equal(response.json.data.length, 100);
    response = await request("/insumos?limit=100&page=15", { token });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.meta.total, TOTAL);
    assert.equal(response.json.data.length, 100);
    response = await request("/pedidos?limit=8&page=150", { token });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.data.length, ORDERS);
    response = await request("/viandas?limit=100&page=12", { token });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.meta.total, SERIES * DELIVERIES_PER_SERIES);
    assert.equal(response.json.data.length, 100);
    response = await request("/caja/resumen", { token });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    assert.equal(response.json.data.ingresos, 210000);

    console.log(
      "OK carga: 1500 clientes, productos e insumos; 1200 pedidos y 1200 entregas de viandas",
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
