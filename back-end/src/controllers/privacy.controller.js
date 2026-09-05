const bcrypt = require('bcryptjs');
const db = require('../config/db');
const emailService = require('../services/email.service');

const OWNER = 'Nicolas Añibarro';
const PRIVACY_EMAIL = 'cientoonce2026@gmail.com';
const updatedAt = '5 de septiembre de 2026';

const page = (title, content) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Ciento Once</title><style>body{margin:0;background:#fffaf0;color:#17231b;font:16px/1.65 Arial,sans-serif}main{max-width:820px;margin:auto;padding:42px 22px 70px}h1{font-size:36px;line-height:1.15}h2{margin-top:34px;color:#206b43}a{color:#206b43;font-weight:700}.card{background:#fff;border:1px solid #d8e5dc;border-radius:18px;padding:24px;margin:24px 0}label{display:block;font-weight:700;margin-bottom:8px}input{box-sizing:border-box;width:100%;padding:14px;border:1px solid #b9cbbf;border-radius:12px;font-size:16px}button{margin-top:14px;border:0;border-radius:12px;padding:14px 20px;background:#278653;color:#fff;font-size:16px;font-weight:800;cursor:pointer}.muted{color:#617067;font-size:14px}li{margin-bottom:8px}</style></head><body><main>${content}</main></body></html>`;

exports.policy = (_req, res) => {
  res.type('html').send(page('Política de privacidad', `
    <p class="muted">Última actualización: ${updatedAt}</p><h1>Política de privacidad de Ciento Once</h1>
    <p>Ciento Once es una aplicación de gestión para comercios. El responsable del tratamiento es <strong>${OWNER}</strong>. Para consultas o para ejercer derechos sobre datos personales puedes escribir a <a href="mailto:${PRIVACY_EMAIL}">${PRIVACY_EMAIL}</a>.</p>
    <h2>Datos que tratamos</h2><ul><li>Datos de cuenta: nombre, correo electrónico, contraseña almacenada mediante hash y datos de acceso.</li><li>Datos comerciales cargados por el usuario: negocio, empleados, clientes, teléfonos, domicilios, productos, insumos, stock, pedidos, compras, caja, costos e informes.</li><li>Ubicación precisa, sólo cuando el usuario la autoriza para ubicar clientes y preparar rutas.</li><li>Imágenes elegidas por el usuario, como tickets, fotografías de productos y logo del negocio.</li><li>Datos técnicos mínimos necesarios para seguridad, diagnóstico y funcionamiento.</li></ul>
    <h2>Finalidades</h2><p>Usamos estos datos para autenticar cuentas, prestar las funciones de gestión, calcular rutas, interpretar tickets, generar piezas gráficas, respaldar información, prevenir abusos y atender solicitudes de soporte o privacidad. No vendemos datos personales ni los usamos para publicidad de terceros.</p>
    <h2>Proveedores</h2><p>Podemos procesar datos mediante Render (alojamiento de la API), Aiven (base de datos), Google Maps Platform (mapas, geocodificación y rutas), Google Gemini (lectura de tickets y generación de imágenes), Gmail/Google (correo transaccional) y Expo/EAS (compilación y servicios técnicos). Estos proveedores pueden procesar información fuera de Argentina conforme a sus condiciones y medidas de seguridad.</p>
    <h2>Imágenes e inteligencia artificial</h2><p>Las fotos de tickets y productos seleccionadas para funciones de IA se envían al servicio correspondiente para producir el resultado solicitado. La aplicación no guarda las fotos de tickets ni las referencias temporales del generador después de responder. El logo o foto del negocio sí se conserva hasta que el usuario lo reemplaza o elimina su cuenta.</p>
    <h2>Conservación y seguridad</h2><p>Conservamos los datos mientras la cuenta permanezca activa o durante el tiempo necesario para prestar el servicio y cumplir obligaciones legales aplicables. Aplicamos autenticación, control por usuario y rol, conexiones cifradas en producción, contraseñas con hash y acceso restringido. Ningún sistema es absolutamente infalible.</p>
    <h2>Elecciones y derechos</h2><p>El usuario puede denegar permisos de cámara, fotos o ubicación desde Android; algunas funciones dejarán de estar disponibles. Puede solicitar acceso, corrección o eliminación escribiendo al correo indicado. La eliminación está disponible en Mi perfil y mediante la <a href="./eliminar-cuenta">página externa de solicitud</a>. Al eliminarla se borran la cuenta y los datos comerciales asociados, salvo información que deba conservarse temporalmente por una obligación legal debidamente informada.</p>
    <h2>Datos de terceros</h2><p>El comercio que carga datos de sus clientes debe contar con una base legítima para utilizarlos, mantenerlos actualizados y evitar información sensible o innecesaria. Ciento Once está dirigido a personas adultas y no está diseñado para menores.</p>
    <h2>Cambios</h2><p>Podemos actualizar esta política cuando cambien las funciones o proveedores. La fecha inicial identifica la versión vigente.</p>
  `));
};

exports.deletionPage = (_req, res) => {
  res.type('html').send(page('Eliminar cuenta', `
    <h1>Solicitar eliminación de cuenta</h1><p>Completa el correo asociado a Ciento Once. Verificaremos la titularidad antes de eliminar definitivamente la cuenta y sus datos.</p>
    <div class="card"><form method="post" action="./solicitar-eliminacion"><label for="email">Correo de la cuenta</label><input id="email" name="email" type="email" maxlength="150" required autocomplete="email"><button type="submit">Solicitar eliminación</button></form></div>
    <p class="muted">También puedes eliminarla directamente desde Mi perfil confirmando tu contraseña. Consultas: <a href="mailto:${PRIVACY_EMAIL}">${PRIVACY_EMAIL}</a>.</p><p><a href="./privacidad">Leer la política de privacidad</a></p>
  `));
};

exports.requestDeletion = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && emailService.configured()) {
    await emailService.sendDeletionRequest({ email }).catch(() => {});
  }
  res.type('html').send(page('Solicitud recibida', '<h1>Solicitud recibida</h1><p>Si el correo corresponde a una cuenta, nos comunicaremos para verificar la titularidad y completar la eliminación.</p><p><a href="./privacidad">Volver a la política de privacidad</a></p>'));
};

exports.deleteAccount = async (req, res) => {
  if (req.usuario.id_empleado) return res.status(403).json({ ok: false, mensaje: 'Sólo el propietario puede eliminar la cuenta' });
  const password = String(req.body.password || '');
  const confirmation = String(req.body.confirmacion || '').trim().toUpperCase();
  if (confirmation !== 'ELIMINAR') return res.status(400).json({ ok: false, mensaje: 'Escribe ELIMINAR para confirmar' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[user]] = await connection.query('SELECT password_hash FROM usuarios WHERE id_usuario=? AND activo=1 FOR UPDATE', [req.usuario.id_usuario]);
    if (!user || !await bcrypt.compare(password, user.password_hash)) throw Object.assign(new Error('La contraseña es incorrecta'), { status: 401 });
    const userId = req.usuario.id_usuario;
    const tables = ['pedido_detalles', 'compra_detalles', 'movimientos_stock', 'movimientos_caja', 'costos_productos', 'cierres_caja', 'pagos_integracion', 'empleados', 'categorias_productos', 'pedidos', 'compras', 'productos', 'insumos', 'clientes', 'configuraciones_comerciales', 'tokens_autenticacion'];
    for (const table of tables) await connection.query(`DELETE FROM ${table} WHERE id_usuario=?`, [userId]);
    await connection.query('DELETE FROM usuarios WHERE id_usuario=?', [userId]);
    await connection.commit();
    res.json({ ok: true, mensaje: 'La cuenta y sus datos fueron eliminados' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
