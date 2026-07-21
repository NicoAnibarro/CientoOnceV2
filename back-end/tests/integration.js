require('dotenv').config();
const assert = require('node:assert/strict');
const app = require('../src/app');
const db = require('../src/config/db');

async function run() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const stamp = Date.now();
  let tokenA;
  let tokenB;

  async function request(path, { method = 'GET', token, body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    return { status: response.status, json };
  }

  try {
    let response = await request('/health');
    assert.equal(response.status, 200);

    response = await request('/auth/register', { method: 'POST', body: { nombre: 'Prueba A', email: `prueba.a.${stamp}@local.test`, password: 'secreto1' } });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    tokenA = response.json.data.token;

    response = await request('/auth/register', { method: 'POST', body: { nombre: 'Duplicado', email: `prueba.a.${stamp}@local.test`, password: 'secreto1' } });
    assert.equal(response.status, 409);
    response = await request('/auth/register', { method: 'POST', body: { nombre: 'Corta', email: `corta.${stamp}@local.test`, password: '123' } });
    assert.equal(response.status, 400);

    response = await request('/auth/register', { method: 'POST', body: { nombre: 'Prueba B', email: `prueba.b.${stamp}@local.test`, password: 'secreto2' } });
    assert.equal(response.status, 201);
    tokenB = response.json.data.token;
    response = await request('/auth/login', { method: 'POST', body: { email: `prueba.a.${stamp}@local.test`, password: 'incorrecta' } });
    assert.equal(response.status, 401);
    response = await request('/auth/me', { token: tokenA });
    assert.equal(response.status, 200);

    response = await request('/productos', { method: 'POST', token: tokenA, body: { nombre: 'Producto integración', descripcion: '', categoria: 'dulce', costo_estimado: 100, precio_venta: 300, stock_actual: 2 } });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    const idProducto = response.json.data.id_producto;
    response = await request('/productos', { token: tokenB });
    assert.equal(response.json.data.some(p => p.id_producto === idProducto), false);
    response = await request(`/productos/${idProducto}`, { method: 'PUT', token: tokenB, body: { nombre: 'Ataque', categoria: 'dulce', costo_estimado: 0, precio_venta: 1, stock_actual: 0 } });
    assert.equal(response.status, 404);

    response = await request('/clientes', { method: 'POST', token: tokenA, body: { nombre: 'Cliente integración', telefono: '123', direccion: 'Calle prueba' } });
    assert.equal(response.status, 201);
    const idCliente = response.json.data.id_cliente;
    response = await request('/clientes', { token: tokenB });
    assert.equal(response.json.data.some(c => c.id_cliente === idCliente), false);

    response = await request('/insumos', { method: 'POST', token: tokenA, body: { nombre: 'Harina integración', descripcion: '', precio_referencia: 1200, cantidad_referencia: 1, unidad_referencia: 'kg', tipo_medida: 'peso', fecha_precio: '2026-07-20' } });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    const idInsumo = response.json.data.id_insumo;

    response = await request('/pedidos', { method: 'POST', token: tokenA, body: { id_cliente: idCliente, fecha_entrega: '2026-12-20', pagado: true, observaciones: 'Prueba automática', detalles: [{ id_producto: idProducto, cantidad: 3 }] } });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    assert.equal(response.json.data.total, 900);
    const idPedido = response.json.data.id_pedido;

    response = await request(`/pedidos/${idPedido}`, { token: tokenA });
    assert.equal(response.json.data.detalles[0].cantidad_stock_descontada, 0);
    response = await request(`/pedidos/${idPedido}`, { token: tokenB });
    assert.equal(response.status, 404);
    response = await request('/productos', { token: tokenA });
    assert.equal(response.json.data.find(p => p.id_producto === idProducto).stock_actual, 2);
    response = await request(`/pedidos/${idPedido}/estado`, { method: 'PATCH', token: tokenA, body: { estado: 'entregado' } });
    assert.equal(response.status, 200);
    response = await request(`/pedidos/${idPedido}`, { token: tokenA });
    assert.equal(response.json.data.detalles[0].cantidad_stock_descontada, 2);
    response = await request('/productos', { token: tokenA });
    assert.equal(response.json.data.find(p => p.id_producto === idProducto).stock_actual, 0);
    response = await request(`/pedidos/${idPedido}/estado`, { method: 'PATCH', token: tokenA, body: { estado: 'pendiente' } });
    assert.equal(response.status, 200);
    response = await request('/productos', { token: tokenA });
    assert.equal(response.json.data.find(p => p.id_producto === idProducto).stock_actual, 2);
    response = await request(`/pedidos/${idPedido}/estado`, { method: 'PATCH', token: tokenA, body: { estado: 'entregado' } });
    assert.equal(response.status, 200);

    response = await request(`/pedidos/${idPedido}/pagado`, { method: 'PATCH', token: tokenA, body: { pagado: false } });
    assert.equal(response.status, 200);
    response = await request(`/pedidos/${idPedido}/pagado`, { method: 'PATCH', token: tokenA, body: { pagado: true } });
    assert.equal(response.status, 200);
    response = await request('/caja', { token: tokenA });
    assert.equal(response.json.data.filter(m => m.origen === 'pedido' && m.origen_id === idPedido).length, 1);

    response = await request('/compras', { method: 'POST', token: tokenA, body: { proveedor: 'Proveedor integración', fecha_compra: '2026-07-20', detalles: [{ id_insumo: idInsumo, cantidad: 2, precio_unitario: 1200 }] } });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    assert.equal(response.json.data.total, 2400);
    response = await request('/caja/resumen', { token: tokenA });
    assert.equal(response.json.data.ingresos, 900);
    assert.equal(response.json.data.egresos, 2400);
    assert.equal(response.json.data.balance, -1500);
    response = await request('/caja/resumen', { token: tokenB });
    assert.deepEqual(response.json.data, { ingresos: 0, egresos: 0, balance: 0 });

    response = await request(`/pedidos/${idPedido}`, { method: 'PUT', token: tokenA, body: { id_cliente: idCliente, fecha_entrega: '2026-12-21', estado: 'entregado', pagado: true, detalles: [{ id_producto: idProducto, cantidad: 1 }] } });
    assert.equal(response.status, 200, JSON.stringify(response.json));
    response = await request('/productos', { token: tokenA });
    assert.equal(response.json.data.find(p => p.id_producto === idProducto).stock_actual, 1);

    response = await request(`/pedidos/${idPedido}/desactivar`, { method: 'PATCH', token: tokenA });
    assert.equal(response.status, 200);
    response = await request('/productos', { token: tokenA });
    assert.equal(response.json.data.find(p => p.id_producto === idProducto).stock_actual, 2);
    response = await request('/caja/resumen', { token: tokenA });
    assert.equal(response.json.data.ingresos, 0);
    assert.equal(response.json.data.egresos, 2400);
    assert.equal(response.json.data.balance, -2400);

    console.log('OK: autenticación, aislamiento, CRUD, stock, pedidos, pagos, compras y caja');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.end();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
