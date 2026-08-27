const db = require('../config/db');

const schema = {
  type: 'object',
  properties: {
    proveedor: { type: 'string' },
    fecha: { type: 'string', nullable: true, description: 'Fecha en formato AAAA-MM-DD' },
    total: { type: 'number', nullable: true },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' }, cantidad: { type: 'number' }, precio_unitario: { type: 'number' }, subtotal: { type: 'number' }
        },
        required: ['nombre', 'cantidad', 'precio_unitario', 'subtotal']
      }
    },
    confianza: { type: 'number', description: 'Confianza general entre 0 y 1' },
    advertencias: { type: 'array', items: { type: 'string' } }
  },
  required: ['proveedor', 'fecha', 'total', 'items', 'confianza', 'advertencias']
};

function normalizar(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function similitud(left, right) {
  const a = new Set(normalizar(left).split(' ').filter(Boolean)), b = new Set(normalizar(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let common = 0; for (const word of a) if (b.has(word)) common += 1;
  const words = 2 * common / (a.size + b.size), includes = normalizar(left).includes(normalizar(right)) || normalizar(right).includes(normalizar(left));
  return Math.max(words, includes ? 0.82 : 0);
}

function numero(value, fallback = 0) {
  const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

exports.analizar = async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ ok: false, mensaje: 'Falta configurar GEMINI_API_KEY en el backend' });
  if (!req.file) return res.status(400).json({ ok: false, mensaje: 'Selecciona una foto del ticket' });
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_TICKET_MODEL || 'gemini-flash-latest',
    contents: [{ text: `Analiza este ticket o factura de compra de Argentina. Extrae únicamente lo que sea legible. No inventes productos, importes ni fechas. Usa punto decimal en números. Para cantidad, usa 1 cuando el ticket muestre un único artículo sin cantidad explícita. Si solo aparece subtotal por renglón, calcula precio_unitario=subtotal/cantidad. Ignora impuestos y medios de pago como artículos. La fecha debe ser AAAA-MM-DD. Si algo es dudoso, indícalo en advertencias y reduce confianza.` }, { inlineData: { mimeType: req.file.mimetype, data: req.file.buffer.toString('base64') } }],
    config: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.1 }
  });
  let parsed;
  try { parsed = JSON.parse(response.text); } catch { return res.status(422).json({ ok: false, mensaje: 'La IA no pudo interpretar este comprobante. Prueba con una foto más nítida.' }); }
  const [supplies] = await db.query('SELECT id_insumo,nombre,precio_referencia FROM insumos WHERE id_usuario=? AND activo=1 ORDER BY nombre', [req.usuario.id_usuario]);
  const items = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 100).map(item => {
    const nombre = String(item.nombre || '').trim().slice(0, 150), cantidad = numero(item.cantidad, 1) || 1, subtotal = numero(item.subtotal), precio = numero(item.precio_unitario, subtotal / cantidad);
    const ranked = supplies.map(supply => ({ supply, score: similitud(nombre, supply.nombre) })).sort((a, b) => b.score - a.score), match = ranked[0];
    return { nombre, cantidad, precio_unitario: Number(precio.toFixed(2)), subtotal: Number((subtotal || precio * cantidad).toFixed(2)), id_insumo_sugerido: match?.score >= 0.55 ? match.supply.id_insumo : null, insumo_sugerido: match?.score >= 0.55 ? match.supply.nombre : null, confianza_coincidencia: Number((match?.score || 0).toFixed(2)) };
  }).filter(item => item.nombre);
  const sum = items.reduce((total, item) => total + item.subtotal, 0), declared = parsed.total == null ? null : numero(parsed.total);
  const warnings = Array.isArray(parsed.advertencias) ? parsed.advertencias.map(String).slice(0, 10) : [];
  if (!items.length) warnings.push('No se detectaron artículos legibles.');
  if (declared != null && Math.abs(sum - declared) > Math.max(2, declared * 0.03)) warnings.push(`La suma de artículos (${sum.toFixed(2)}) no coincide con el total detectado (${declared.toFixed(2)}).`);
  res.json({ ok: true, data: { proveedor: String(parsed.proveedor || '').trim().slice(0, 150), fecha: /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha || '') ? parsed.fecha : null, total: declared, items, confianza: Math.min(1, numero(parsed.confianza)), advertencias: [...new Set(warnings)] } });
};
