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
          nombre: { type: 'string' },
          cantidad: { type: 'number' },
          precio_unitario: { type: 'number' },
          subtotal: { type: 'number' }
        },
        required: ['nombre', 'cantidad', 'precio_unitario', 'subtotal']
      }
    },
    descuentos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          descripcion: { type: 'string' },
          importe: { type: 'number' },
          confianza: { type: 'number' }
        },
        required: ['descripcion', 'importe', 'confianza']
      }
    },
    confianza: { type: 'number', description: 'Confianza general entre 0 y 1' },
    advertencias: { type: 'array', items: { type: 'string' } }
  },
  required: ['proveedor', 'fecha', 'total', 'items', 'descuentos', 'confianza', 'advertencias']
};

function normalizar(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function similitud(left, right) {
  const a = new Set(normalizar(left).split(' ').filter(Boolean));
  const b = new Set(normalizar(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common += 1;
  const words = 2 * common / (a.size + b.size);
  const includes = normalizar(left).includes(normalizar(right)) || normalizar(right).includes(normalizar(left));
  return Math.max(words, includes ? 0.82 : 0);
}

function numero(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function numeroConSigno(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cerca(left, right) {
  return Math.abs(left - right) <= Math.max(2, Math.abs(right) * 0.03);
}

exports.analizar = async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ ok: false, mensaje: 'Falta configurar GEMINI_API_KEY en el backend' });
  if (!req.file) return res.status(400).json({ ok: false, mensaje: 'Selecciona una foto del ticket' });
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_TICKET_MODEL || 'gemini-flash-latest',
    contents: [
      {
        text: `Analiza este ticket o factura de compra de Argentina. Extrae únicamente lo legible y no inventes datos. Usa punto decimal. Si no hay cantidad explícita usa 1; si solo hay subtotal calcula precio_unitario=subtotal/cantidad. Ignora impuestos y medios de pago como artículos. Separa descuentos, bonificaciones y ahorros en descuentos; no deben aparecer también como items. Un importe negativo es una señal fuerte de descuento. La abreviatura "desc" en el nombre de un producto NO basta: clasifícala como descuento solo si el signo, la disposición y la reconciliación aritmética lo respaldan. Verifica suma(items)-suma(descuentos)=total; si no coincide, conserva la línea como artículo y agrega una advertencia. La fecha debe ser AAAA-MM-DD. Reduce confianza ante cualquier duda.`
      },
      { inlineData: { mimeType: req.file.mimetype, data: req.file.buffer.toString('base64') } }
    ],
    config: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.1 }
  });
  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    return res.status(422).json({ ok: false, mensaje: 'La IA no pudo interpretar este comprobante. Prueba con una foto más nítida.' });
  }

  const [supplies] = await db.query(
    'SELECT id_insumo,nombre,precio_referencia FROM insumos WHERE id_usuario=? AND activo=1 ORDER BY nombre',
    [req.usuario.id_usuario]
  );
  const declared = parsed.total == null ? null : numero(parsed.total);
  const rawItems = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 100);
  const rawPositiveTotal = rawItems.reduce(
    (sum, item) => sum + Math.max(0, numeroConSigno(item.subtotal)),
    0
  );
  const discounts = (Array.isArray(parsed.descuentos) ? parsed.descuentos : [])
    .map(item => ({
      descripcion: String(item.descripcion || 'Descuento').trim().slice(0, 150),
      importe: Math.abs(numeroConSigno(item.importe)),
      confianza: Math.min(1, numero(item.confianza))
    }))
    .filter(item => item.importe > 0);
  const itemRows = [];
  for (const item of rawItems) {
    const name = normalizar(item.nombre);
    const signedSubtotal = numeroConSigno(item.subtotal);
    const amount = Math.abs(signedSubtotal);
    const explicit = /\b(descuento|bonificacion|ahorro)\b/.test(name);
    const abbreviation = /\bdesc\b/.test(name);
    const reconcilesAsDiscount = declared != null && amount > 0 && cerca(rawPositiveTotal - amount, declared);
    if (signedSubtotal < 0 || explicit || (abbreviation && reconcilesAsDiscount)) {
      discounts.push({
        descripcion: String(item.nombre || 'Descuento').trim().slice(0, 150),
        importe: amount,
        confianza: abbreviation && !explicit ? 0.7 : 0.95
      });
    } else {
      itemRows.push(item);
    }
  }
  const items = itemRows.map(item => {
    const nombre = String(item.nombre || '').trim().slice(0, 150);
    const cantidad = numero(item.cantidad, 1) || 1;
    const subtotal = numero(item.subtotal);
    const precio = numero(item.precio_unitario, subtotal / cantidad);
    const ranked = supplies
      .map(supply => ({ supply, score: similitud(nombre, supply.nombre) }))
      .sort((a, b) => b.score - a.score);
    const match = ranked[0];
    return {
      nombre,
      cantidad,
      precio_unitario: Number(precio.toFixed(2)),
      subtotal: Number((subtotal || precio * cantidad).toFixed(2)),
      id_insumo_sugerido: match?.score >= 0.55 ? match.supply.id_insumo : null,
      insumo_sugerido: match?.score >= 0.55 ? match.supply.nombre : null,
      confianza_coincidencia: Number((match?.score || 0).toFixed(2))
    };
  }).filter(item => item.nombre);
  const sum = items.reduce((total, item) => total + item.subtotal, 0);
  let discountAmount = Number(discounts.reduce((total, item) => total + item.importe, 0).toFixed(2));
  const impliedDiscount = declared == null ? 0 : Number((sum - declared).toFixed(2));
  if (impliedDiscount > 0 && (!discountAmount || !cerca(discountAmount, impliedDiscount))) {
    discountAmount = impliedDiscount;
  }
  const warnings = Array.isArray(parsed.advertencias) ? parsed.advertencias.map(String).slice(0, 10) : [];
  if (!items.length) warnings.push('No se detectaron artículos legibles.');
  if (declared != null && !cerca(sum - discountAmount, declared)) {
    warnings.push(`La suma de artículos menos descuentos (${(sum - discountAmount).toFixed(2)}) no coincide con el total detectado (${declared.toFixed(2)}).`);
  }
  res.json({
    ok: true,
    data: {
      proveedor: String(parsed.proveedor || '').trim().slice(0, 150),
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha || '') ? parsed.fecha : null,
      total: declared,
      items,
      descuentos: discounts,
      descuento_importe_sugerido: discountAmount,
      confianza: Math.min(1, numero(parsed.confianza)),
      advertencias: [...new Set(warnings)]
    }
  });
};
