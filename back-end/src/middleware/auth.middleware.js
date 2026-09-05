const jwt = require('jsonwebtoken');
const db = require('../config/db');

module.exports = async (req, res, next) => {
  const value = req.headers.authorization || '';
  const rawToken = value.startsWith('Bearer ') ? value.slice(7) : null;
  if (!rawToken) return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesión' });
  try {
    const data = jwt.verify(rawToken, process.env.JWT_SECRET);
    const [[user]] = await db.query(
      'SELECT sesion_version,email_verificado FROM usuarios WHERE id_usuario=? AND activo=1',
      [data.id_usuario]
    );
    if (!user || !user.email_verificado || Number(user.sesion_version) !== Number(data.sesion_version || 0)) {
      return res.status(401).json({ ok: false, mensaje: 'Sesión inválida o vencida' });
    }
    req.usuario = {
      id_usuario: data.id_usuario,
      email: data.email,
      rol: data.rol || 'propietario',
      id_empleado: data.id_empleado || null,
      nombre_empleado: data.nombre_empleado || null
    };
    next();
  } catch {
    return res.status(401).json({ ok: false, mensaje: 'Sesión inválida o vencida' });
  }
};
