const db = require('../config/db');
const { GoogleAuth } = require('google-auth-library');
const { fechaValida } = require('../utils/fechas');

function googleCredentials() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) return undefined;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 no contiene credenciales válidas');
  }
}

const auth = new GoogleAuth({
  credentials: googleCredentials(),
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

function segundos(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function coordenada(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function distancia(a, b) {
  const rad = value => value * Math.PI / 180; const earth = 6371000;
  const dLat = rad(Number(b.latitud ?? b.latitude) - Number(a.latitud ?? a.latitude));
  const dLng = rad(Number(b.longitud ?? b.longitude) - Number(a.longitud ?? a.longitude));
  const lat1 = rad(Number(a.latitud ?? a.latitude)), lat2 = rad(Number(b.latitud ?? b.latitude));
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(value));
}

function ordenarLocalmente(origin, orders) {
  const pending = [...orders], ordered = []; let current = origin;
  while (pending.length) {
    let best = 0;
    for (let index = 1; index < pending.length; index += 1) if (distancia(current, pending[index]) < distancia(current, pending[best])) best = index;
    current = pending.splice(best, 1)[0]; ordered.push(current);
  }
  if (ordered.length > 250) return ordered;
  for (let pass = 0; pass < 5; pass += 1) {
    let improved = false;
    for (let left = 0; left < ordered.length - 1; left += 1) for (let right = left + 1; right < ordered.length; right += 1) {
      const before = left ? ordered[left - 1] : origin, after = right + 1 < ordered.length ? ordered[right + 1] : null;
      const currentCost = distancia(before, ordered[left]) + (after ? distancia(ordered[right], after) : 0);
      const swappedCost = distancia(before, ordered[right]) + (after ? distancia(ordered[left], after) : 0);
      if (swappedCost + 1 < currentCost) { const segment = ordered.slice(left, right + 1).reverse(); ordered.splice(left, segment.length, ...segment); improved = true; }
    }
    if (!improved) break;
  }
  return ordered;
}

function decodePolyline(encoded = '') {
  const coordinates = []; let index = 0; let lat = 0; let lng = 0;
  while (index < encoded.length) {
    let result = 0; let shift = 0; let byte;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coordinates;
}

function filtros(req) {
  const args = [req.usuario.id_usuario]; let where = "p.id_usuario=? AND p.activo=1 AND p.estado<>'cancelado'";
  if (['pendiente', 'entregado'].includes(req.query.estado)) { where += ' AND p.estado=?'; args.push(req.query.estado); }
  if (['true', 'false'].includes(req.query.pagado)) { where += ' AND p.pagado=?'; args.push(req.query.pagado === 'true' ? 1 : 0); }
  if (req.query.desde && fechaValida(req.query.desde)) { where += ' AND p.fecha_entrega>=?'; args.push(req.query.desde); }
  if (req.query.hasta && fechaValida(req.query.hasta)) { where += ' AND p.fecha_entrega<=?'; args.push(req.query.hasta); }
  if (req.query.categoria) { where += ' AND EXISTS(SELECT 1 FROM pedido_detalles pd JOIN productos pr ON pr.id_producto=pd.id_producto AND pr.id_usuario=p.id_usuario WHERE pd.id_pedido=p.id_pedido AND pr.categoria=?)'; args.push(String(req.query.categoria).trim()); }
  if (req.query.buscar) { const term = `%${String(req.query.buscar).trim()}%`; where += ' AND (p.cliente_nombre LIKE ? OR p.cliente_direccion LIKE ? OR EXISTS(SELECT 1 FROM pedido_detalles pd WHERE pd.id_pedido=p.id_pedido AND pd.producto_nombre LIKE ?))'; args.push(term, term, term); }
  return { where, args };
}

exports.pedidos = async (req, res) => {
  const { where, args } = filtros(req);
  const [rows] = await db.query(`SELECT p.id_pedido,p.cliente_nombre,p.cliente_telefono,
      COALESCE(c.direccion,p.cliente_direccion) direccion,c.latitud,c.longitud,p.fecha_entrega,
      p.estado,p.pagado,p.total,
      (SELECT GROUP_CONCAT(CONCAT(pd.producto_nombre,' x',pd.cantidad) SEPARATOR ', ') FROM pedido_detalles pd WHERE pd.id_pedido=p.id_pedido) detalle
    FROM pedidos p LEFT JOIN clientes c ON c.id_cliente=p.id_cliente AND c.id_usuario=p.id_usuario
    WHERE ${where} ORDER BY p.fecha_entrega ASC,p.id_pedido ASC`, args);
  res.json({ ok: true, data: rows.map(row => ({ ...row, tiene_ubicacion: row.latitud != null && row.longitud != null })) });
};

async function optimizarOrden(project, origin, orders) {
  try {
    const client = await auth.getClient(); const start = new Date(Date.now() + 60 * 1000); const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { data } = await client.request({
      url: `https://routeoptimization.googleapis.com/v1/projects/${project}:optimizeTours`, method: 'POST', timeout: 45000,
      data: { model: {
        shipments: orders.map(order => ({ label: String(order.id_pedido), penaltyCost: 1000000000000, deliveries: [{ arrivalLocation: { latitude: Number(order.latitud), longitude: Number(order.longitud) }, duration: '300s' }] })),
        vehicles: [{ label: 'reparto', startLocation: origin }], globalStartTime: segundos(start), globalEndTime: segundos(end)
      }}
    });
    const visits = data.routes?.[0]?.visits || [], optimized = visits.map(visit => orders[visit.shipmentIndex]).filter(Boolean);
    if (optimized.length === orders.length) return { orders: optimized, mode: 'google' };
  } catch (error) {
    console.warn('Route Optimization no disponible; se usará el orden local:', error.response?.status || error.code || error.message);
  }
  return { orders: ordenarLocalmente(origin, orders), mode: 'hibrida' };
}

async function tramoRoutes(points) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw Object.assign(new Error('Falta GOOGLE_MAPS_SERVER_KEY'), { status: 500 });
  const body = { origin: { location: { latLng: { latitude: points[0].latitude, longitude: points[0].longitude } } }, destination: { location: { latLng: { latitude: points.at(-1).latitude, longitude: points.at(-1).longitude } } }, intermediates: points.slice(1, -1).map(point => ({ location: { latLng: point } })), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', polylineQuality: 'OVERVIEW' };
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error?.message || 'No se pudo dibujar la ruta'), { status: response.status });
  const route = data.routes?.[0]; return { distancia_metros: Number(route?.distanceMeters || 0), duracion_segundos: Number(String(route?.duration || '0s').replace('s', '')), coordenadas: decodePolyline(route?.polyline?.encodedPolyline) };
}

exports.optimizar = async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body.pedidos) ? req.body.pedidos : []).map(Number).filter(Number.isInteger).filter(id => id > 0))];
  const latitude = coordenada(req.body.origen?.latitude, -90, 90), longitude = coordenada(req.body.origen?.longitude, -180, 180);
  if (!ids.length) return res.status(400).json({ ok: false, mensaje: 'Selecciona al menos un pedido' });
  if (latitude === null || longitude === null) return res.status(400).json({ ok: false, mensaje: 'Ubicación de partida inválida' });
  const placeholders = ids.map(() => '?').join(',');
  const [orders] = await db.query(`SELECT p.id_pedido,p.cliente_nombre,p.cliente_telefono,COALESCE(c.direccion,p.cliente_direccion) direccion,c.latitud,c.longitud,p.fecha_entrega,p.total
    FROM pedidos p JOIN clientes c ON c.id_cliente=p.id_cliente AND c.id_usuario=p.id_usuario
    WHERE p.id_usuario=? AND p.activo=1 AND p.estado<>'cancelado' AND p.id_pedido IN (${placeholders})`, [req.usuario.id_usuario, ...ids]);
  if (orders.length !== ids.length) return res.status(400).json({ ok: false, mensaje: 'Hay pedidos inexistentes o no disponibles' });
  const missing = orders.filter(order => order.latitud == null || order.longitud == null);
  if (missing.length) return res.status(400).json({ ok: false, mensaje: `Falta la ubicación de ${missing.map(order => order.cliente_nombre).join(', ')}` });
  const origin = { latitude, longitude }; const optimization = await optimizarOrden(process.env.GOOGLE_CLOUD_PROJECT_ID, origin, orders), ordered = optimization.orders;
  const points = [origin, ...ordered.map(order => ({ latitude: Number(order.latitud), longitude: Number(order.longitud) }))];
  const chunks = [];
  for (let index = 0; index < points.length - 1; index += 26) chunks.push(points.slice(index, Math.min(index + 27, points.length)));
  const routeParts = await Promise.all(chunks.map(tramoRoutes));
  res.json({ ok: true, data: { pedidos: ordered, origen: origin, optimizacion: optimization.mode, coordenadas: routeParts.flatMap((part, index) => index ? part.coordenadas.slice(1) : part.coordenadas), distancia_metros: routeParts.reduce((sum, part) => sum + part.distancia_metros, 0), duracion_segundos: routeParts.reduce((sum, part) => sum + part.duracion_segundos, 0) } });
};
