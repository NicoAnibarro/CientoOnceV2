const db = require('../config/db');

const palettes = {
  verde_crema: { description: 'verde esmeralda, crema cálido, blanco y negro', primary: '#278653', soft: '#FFFAF0', text: '#17231B' },
  tierra: { description: 'terracota, beige arena, marrón cacao y blanco', primary: '#B85C3B', soft: '#F5E8D5', text: '#4A2D20' },
  oceano: { description: 'azul petróleo, celeste suave, blanco y gris oscuro', primary: '#126E82', soft: '#E4F3F5', text: '#173B57' },
  berries: { description: 'bordó, rosa empolvado, crema y carbón', primary: '#8D244D', soft: '#F8E5EB', text: '#40232E' },
  moderno: { description: 'negro, blanco, gris claro y amarillo dorado', primary: '#111111', soft: '#F6F6F4', text: '#111111' }
};

const price = value => `$ ${new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: Number(value) % 1 ? 2 : 0,
  maximumFractionDigits: 2
}).format(Number(value || 0))}`;

exports.logo = async (req, res) => {
  const [[row]] = await db.query(
    'SELECT logo_mime,logo_imagen FROM configuraciones_comerciales WHERE id_usuario=?',
    [req.usuario.id_usuario]
  );
  if (!row?.logo_imagen) return res.status(404).json({ ok: false, mensaje: 'El negocio no tiene logo' });
  res.set('Cache-Control', 'private, max-age=300');
  res.type(row.logo_mime || 'image/jpeg').send(row.logo_imagen);
};

exports.guardarLogo = async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, mensaje: 'Selecciona una imagen' });
  await db.query(
    `INSERT INTO configuraciones_comerciales(id_usuario,logo_mime,logo_imagen)
     VALUES(?,?,?) ON DUPLICATE KEY UPDATE logo_mime=VALUES(logo_mime),logo_imagen=VALUES(logo_imagen)`,
    [req.usuario.id_usuario, req.file.mimetype, req.file.buffer]
  );
  res.json({ ok: true, mensaje: 'Imagen del negocio actualizada' });
};

exports.generar = async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ ok: false, mensaje: 'Falta configurar Gemini' });
  let ids;
  try { ids = JSON.parse(req.body.productos || '[]').map(Number).filter(Number.isInteger).slice(0, 8); } catch { ids = []; }
  if (!ids.length) return res.status(400).json({ ok: false, mensaje: 'Selecciona al menos un producto' });
  const marks = ids.map(() => '?').join(',');
  const [products] = await db.query(
    `SELECT nombre,descripcion,precio_venta FROM productos WHERE id_usuario=? AND activo=1 AND id_producto IN (${marks})`,
    [req.usuario.id_usuario, ...ids]
  );
  if (!products.length) return res.status(404).json({ ok: false, mensaje: 'No se encontraron productos válidos' });
  const [[business]] = await db.query(
    'SELECT nombre_negocio,telefono,direccion,paleta_visual,logo_mime,logo_imagen FROM configuraciones_comerciales WHERE id_usuario=?',
    [req.usuario.id_usuario]
  );
  const headline = String(req.body.titulo || '').trim().slice(0, 100);
  const note = String(req.body.detalle || '').trim().slice(0, 180);
  const cta = String(req.body.cta || '').trim().slice(0, 70);
  const creativeDirection = String(req.body.direccion_creativa || '').trim().slice(0, 500);
  const designType = ['promocion', 'menu', 'editorial'].includes(req.body.tipo_diseno) ? req.body.tipo_diseno : 'promocion';
  const visualStyle = ['sorpresa', 'fotografia', 'artesanal', 'audaz', 'minimalista', 'collage'].includes(req.body.estilo_visual)
    ? req.body.estilo_visual
    : 'sorpresa';
  const palette = palettes[req.body.paleta] || palettes[business?.paleta_visual] || palettes.verde_crema;
  const productText = products.map(item => `- ${item.nombre}${item.descripcion ? ` (${String(item.descripcion).slice(0, 80)})` : ''}`).join('\n');
  const referencePhotos = Array.isArray(req.files) ? req.files.slice(0, 3) : [];
  const photoInstructions = referencePhotos.length
    ? `Las ${referencePhotos.length} imágenes adjuntas son referencias reales del comercio. Usa los productos fotografiados como protagonistas y conserva fielmente forma, proporciones, colores, textura, decoración y aspecto artesanal. Puedes aislarlos de sus fondos originales, eliminar mesa, manos, personas, bolsas, desorden, texto accidental y objetos ajenos. Reconstruye bordes limpios, combina las referencias con naturalidad y ajusta iluminación y sombras a la escena nueva. No sustituyas los productos por versiones genéricas ni uses la foto completa como un rectángulo pegado, salvo que la dirección creativa pida expresamente una fotografía de fondo.`
    : `No hay fotografía de referencia. Construye una representación fotográfica realista y coherente con los nombres y descripciones de los productos. No agregues productos ni elementos protagonistas que no hayan sido solicitados.`;
  const styleDirections = {
    sorpresa: 'Elige libremente una dirección artística original y distinta. Evita recursos previsibles y no repitas la composición típica de producto centrado sobre una mesa.',
    fotografia: 'Fotografía gastronómica o de producto editorial de alta gama, lente y encuadre expresivos, iluminación profesional y profundidad realista.',
    artesanal: 'Dirección cálida y artesanal sofisticada, texturas auténticas y composición orgánica; evita el aspecto rústico genérico o anticuado.',
    audaz: 'Campaña gráfica audaz, enérgica y contemporánea, con escala dramática, formas expresivas y contraste alto sin perder legibilidad.',
    minimalista: 'Lujo minimalista, pocos elementos cuidadosamente elegidos, espacio negativo intencional y detalles impecables.',
    collage: 'Collage editorial contemporáneo con recortes de producto, capas, profundidad y formas gráficas refinadas; nada infantil ni improvisado.'
  };
  const layoutGuidance = {
    menu: 'La pieza será un MENÚ o lista de precios. Integra productos, nombres, precios y datos en una composición original, clara y fácil de leer.',
    promocion: 'La pieza será una PROMOCIÓN. Convierte la oferta y su llamada a la acción en una campaña visual atractiva, con el producto como protagonista.',
    editorial: 'La pieza será una PUBLICACIÓN EDITORIAL. Prioriza una idea visual inesperada y expresiva, con tipografía integrada como parte del concepto.'
  };
  const variationId = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  const businessName = String(business?.nombre_negocio || '').trim();
  const contact = [business?.telefono, business?.direccion].filter(Boolean).join(' · ');
  const exactProducts = products.map(item => `- ${JSON.stringify(String(item.nombre))}: ${JSON.stringify(price(item.precio_venta))}`).join('\n');
  const exactCopy = [
    businessName && `MARCA: ${JSON.stringify(businessName)}`,
    headline && `TÍTULO: ${JSON.stringify(headline)}`,
    note && `INFORMACIÓN: ${JSON.stringify(note)}`,
    cta && `LLAMADA A LA ACCIÓN: ${JSON.stringify(cta)}`,
    contact && `CONTACTO: ${JSON.stringify(contact)}`,
    `PRODUCTOS Y PRECIOS:\n${exactProducts}`
  ].filter(Boolean).join('\n');
  const prompt = `Actúa como un equipo senior de dirección de arte, fotografía publicitaria, redacción y diseño para redes sociales. Genera una pieza publicitaria FINAL, completa y lista para publicar, en formato vertical 4:5 para un negocio argentino. Toda la fotografía, ilustración, composición y tipografía deben ser creadas juntas por ti en una sola imagen. No habrá textos, placas ni elementos agregados posteriormente.

PRODUCTOS QUE DEBEN APARECER O INSPIRAR LA ESCENA:
${productText}

CONTENIDO TEXTUAL OBLIGATORIO:
${exactCopy}

INSTRUCCIONES CRÍTICAS PARA EL TEXTO:
- Copia literalmente cada texto entre comillas, carácter por carácter, respetando español, tildes, mayúsculas, números, teléfono, signos y precios.
- No traduzcas, resumas, corrijas, reformules ni inventes palabras.
- No agregues texto de relleno, pseudotexto, marcas ficticias ni información no proporcionada.
- Cada contenido no vacío debe aparecer una sola vez, bien escrito y claramente legible.
- Antes de finalizar, revisa visualmente cada palabra y número contra el bloque de contenido obligatorio.

CAMPAÑA:
- Tipo: ${designType}.
- Identificador creativo ${variationId}: úsalo sólo para plantear una solución visual nueva, no lo representes.
- Interpreta el significado del contenido para inventar el concepto, ambiente, iluminación, narrativa visual y tratamiento tipográfico.

DIRECCIÓN VISUAL:
- Paleta obligatoria: ${palette.description}.
- Estilo elegido: ${styleDirections[visualStyle]}
- Objetivo: ${layoutGuidance[designType]}
- Dirección adicional del comerciante: ${creativeDirection || 'Tienes libertad creativa total, siempre dentro de una estética comercial profesional.'}
- Resultado premium, contemporáneo, limpio, cálido y creíble; calidad de campaña comercial profesional, no aspecto de plantilla genérica.
- Haz que la tipografía sea parte orgánica de la dirección de arte. Elige familia, escala, posición, ritmo y contraste adecuados a esta pieza concreta.
- Cuenta una idea visual alrededor del producto: usa encuadre, escala, materiales, luz y profundidad con intención. Cambia recursos, estructura y punto de vista entre generaciones.
- Evita duplicaciones, objetos deformados, productos cortados, composiciones recargadas y elementos sin relación con el negocio.
- No inventes envases, marcas o presentaciones que puedan confundir al cliente.
- No recurras automáticamente a tarjetas, paneles, cintas o recuadros de color. Úsalos solamente si la idea creativa específica realmente los necesita; prioriza composiciones integradas y diferentes.

TRATAMIENTO DE LA FOTO:
${photoInstructions}

Devuelve solamente la pieza terminada, con todos los textos integrados, sin explicaciones fuera de la imagen.`;
  const parts = [{ text: prompt }];
  for (const file of referencePhotos) {
    parts.push({
      inlineData: {
        mimeType: file.mimetype,
        data: file.buffer.toString('base64')
      }
    });
  }
  if (business?.logo_imagen) {
    parts.push({ text: 'La siguiente imagen es el logo real del negocio. Intégralo una sola vez sin redibujarlo, deformarlo ni alterar sus letras.' });
    parts.push({
      inlineData: {
        mimeType: business.logo_mime || 'image/png',
        data: Buffer.from(business.logo_imagen).toString('base64')
      }
    });
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let response;
  try {
    response = await ai.models.generateContent({
      model: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '4:5' }
      }
    });
  } catch (error) {
    const cause = error?.cause?.code || error?.cause?.message;
    const detail = `${error?.message || 'Solicitud rechazada'}${cause ? ` (${cause})` : ''}`.slice(0, 350);
    throw Object.assign(new Error(`Gemini no pudo generar la imagen: ${detail}`), { status: 502 });
  }
  const responseParts = response.candidates?.[0]?.content?.parts || [];
  const image = responseParts.find(part => part.inlineData?.data)?.inlineData;
  if (!image?.data) {
    const explanation = responseParts.find(part => part.text)?.text;
    throw Object.assign(new Error(explanation || 'Gemini no devolvió una imagen'), { status: 502 });
  }
  res.json({
    ok: true,
    data: { imagen_base64: image.data, mime: image.mimeType || 'image/png' }
  });
};
