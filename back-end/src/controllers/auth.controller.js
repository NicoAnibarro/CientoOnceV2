const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const emailService = require('../services/email.service');

const emailOk = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const passwordOk = value => typeof value === 'string' && value.length >= 8 && value.length <= 72;
const emailVerificationRequired = () => {
  const explicit = String(process.env.REQUIRE_EMAIL_VERIFICATION || '').toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return !['development', 'test'].includes(String(process.env.NODE_ENV || '').toLowerCase());
};
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const token = user => jwt.sign(
  { id_usuario: user.id_usuario, email: user.email, rol: user.rol, id_empleado: user.id_empleado, nombre_empleado: user.nombre_empleado, sesion_version: Number(user.sesion_version || 0) },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

async function issue(connection, userId, purpose) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const code = String(crypto.randomInt(100000, 1000000));
  await connection.query(
    'UPDATE tokens_autenticacion SET usado_en=COALESCE(usado_en,NOW()) WHERE id_usuario=? AND proposito=? AND usado_en IS NULL',
    [userId, purpose]
  );
  await connection.query(
    'INSERT INTO tokens_autenticacion(id_usuario,proposito,token_hash,codigo_hash,vence_en) VALUES(?,?,?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))',
    [userId, purpose, hash(rawToken), hash(code)]
  );
  return { rawToken, code };
}

async function consumeByCode(connection, userId, purpose, code) {
  const [[row]] = await connection.query(
    `SELECT id_token_autenticacion FROM tokens_autenticacion
     WHERE id_usuario=? AND proposito=? AND codigo_hash=? AND usado_en IS NULL
       AND vence_en>NOW() AND intentos<8
     ORDER BY id_token_autenticacion DESC LIMIT 1 FOR UPDATE`,
    [userId, purpose, hash(code)]
  );
  if (!row) {
    await connection.query(
      'UPDATE tokens_autenticacion SET intentos=intentos+1 WHERE id_usuario=? AND proposito=? AND usado_en IS NULL AND vence_en>NOW()',
      [userId, purpose]
    );
    return null;
  }
  await connection.query('UPDATE tokens_autenticacion SET usado_en=NOW() WHERE id_token_autenticacion=?', [row.id_token_autenticacion]);
  return row;
}

exports.register = async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!nombre || !emailOk(email) || !passwordOk(password)) {
    return res.status(400).json({ ok: false, mensaje: 'Revisa nombre, email y contraseña (8 a 72 caracteres)' });
  }
  const skipVerification =
    email.endsWith('@local.test') ||
    (!emailVerificationRequired() && !emailService.configured());
  if (!skipVerification && !emailService.configured()) {
    return res.status(503).json({ ok: false, mensaje: 'El envío de correo todavía no está configurado' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[exists]] = await connection.query('SELECT id_usuario FROM usuarios WHERE email=?', [email]);
    if (exists) throw Object.assign(new Error('El email ya está registrado'), { status: 409 });
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await connection.query(
      'INSERT INTO usuarios(nombre,email,password_hash,email_verificado,fecha_verificacion_email) VALUES(?,?,?, ?,IF(?=1,NOW(),NULL))',
      [nombre, email, passwordHash, skipVerification ? 1 : 0, skipVerification ? 1 : 0]
    );
    if (!skipVerification) {
      const credentials = await issue(connection, result.insertId, 'verificar_email');
      await emailService.sendVerification({ email, nombre, code: credentials.code, token: credentials.rawToken });
    }
    await connection.commit();
    const testUser = { id_usuario: result.insertId, nombre, email };
    res.status(201).json({
      ok: true,
      mensaje: skipVerification ? 'Cuenta creada correctamente' : 'Te enviamos un correo para verificar tu cuenta',
      data: {
        email,
        requiere_verificacion: !skipVerification,
        ...(skipVerification ? { token: token(testUser), usuario: testUser } : {})
      }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.login = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const [[user]] = await db.query(
    'SELECT id_usuario,nombre,email,password_hash,email_verificado,sesion_version FROM usuarios WHERE email=? AND activo=1',
    [email]
  );
  if (!user || !await bcrypt.compare(password, user.password_hash)) {
    return res.status(401).json({ ok: false, mensaje: 'Email o contraseña incorrectos' });
  }
  if (!user.email_verificado && emailVerificationRequired()) {
    return res.status(403).json({ ok: false, codigo: 'EMAIL_NO_VERIFICADO', mensaje: 'Primero verifica tu correo electrónico' });
  }
  if (!user.email_verificado) {
    await db.query(
      'UPDATE usuarios SET email_verificado=1,fecha_verificacion_email=COALESCE(fecha_verificacion_email,NOW()) WHERE id_usuario=?',
      [user.id_usuario]
    );
  }
  delete user.password_hash;
  delete user.email_verificado;
  res.json({ ok: true, mensaje: 'Sesión iniciada', data: { token: token(user), usuario: user } });
};

exports.resendVerification = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const [[user]] = await db.query('SELECT id_usuario,nombre,email,email_verificado FROM usuarios WHERE email=? AND activo=1', [email]);
  if (!user || user.email_verificado) return res.json({ ok: true, mensaje: 'Si la cuenta está pendiente, recibirás un nuevo correo' });
  if (!emailService.configured()) return res.status(503).json({ ok: false, mensaje: 'El envío de correo todavía no está configurado' });
  const credentials = await issue(db, user.id_usuario, 'verificar_email');
  await emailService.sendVerification({ email: user.email, nombre: user.nombre, code: credentials.code, token: credentials.rawToken });
  res.json({ ok: true, mensaje: 'Nuevo código enviado' });
};

exports.verifyEmail = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.codigo || '').trim();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[user]] = await connection.query('SELECT id_usuario,email_verificado FROM usuarios WHERE email=? AND activo=1 FOR UPDATE', [email]);
    if (!user) throw Object.assign(new Error('Código inválido o vencido'), { status: 400 });
    if (!user.email_verificado) {
      const consumed = await consumeByCode(connection, user.id_usuario, 'verificar_email', code);
      if (!consumed) throw Object.assign(new Error('Código inválido o vencido'), { status: 400 });
      await connection.query('UPDATE usuarios SET email_verificado=1,fecha_verificacion_email=NOW() WHERE id_usuario=?', [user.id_usuario]);
    }
    await connection.commit();
    res.json({ ok: true, mensaje: 'Correo verificado. Ya puedes iniciar sesión' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.verifyEmailLink = async (req, res) => {
  const tokenHash = hash(req.query.token || '');
  const connection = await db.getConnection();
  let success = false;
  try {
    await connection.beginTransaction();
    const [[row]] = await connection.query(
      `SELECT t.id_token_autenticacion,t.id_usuario FROM tokens_autenticacion t
       JOIN usuarios u ON u.id_usuario=t.id_usuario
       WHERE t.token_hash=? AND t.proposito='verificar_email' AND t.usado_en IS NULL
         AND t.vence_en>NOW() AND u.activo=1 FOR UPDATE`,
      [tokenHash]
    );
    if (row) {
      await connection.query('UPDATE tokens_autenticacion SET usado_en=NOW() WHERE id_token_autenticacion=?', [row.id_token_autenticacion]);
      await connection.query('UPDATE usuarios SET email_verificado=1,fecha_verificacion_email=NOW() WHERE id_usuario=?', [row.id_usuario]);
      success = true;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.status(success ? 200 : 400).send(`<!doctype html><html><body style="font-family:Arial;text-align:center;padding:60px;background:#fffaf0"><h1 style="color:#278653">${success ? 'Correo verificado' : 'Enlace inválido o vencido'}</h1><p>${success ? 'Ya puedes volver a Ciento Once e iniciar sesión.' : 'Solicita un código nuevo desde la aplicación.'}</p></body></html>`);
};

exports.forgotPassword = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const [[user]] = await db.query('SELECT id_usuario,nombre,email FROM usuarios WHERE email=? AND activo=1 AND email_verificado=1', [email]);
  if (user && emailService.configured()) {
    const credentials = await issue(db, user.id_usuario, 'recuperar_password');
    await emailService.sendPasswordReset({ email: user.email, nombre: user.nombre, code: credentials.code, token: credentials.rawToken });
  }
  res.json({ ok: true, mensaje: 'Si existe una cuenta verificada, recibirás un código de recuperación' });
};

exports.resetPassword = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.codigo || '').trim();
  const password = String(req.body.password || '');
  if (!passwordOk(password)) return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener entre 8 y 72 caracteres' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[user]] = await connection.query('SELECT id_usuario FROM usuarios WHERE email=? AND activo=1 AND email_verificado=1 FOR UPDATE', [email]);
    if (!user || !await consumeByCode(connection, user.id_usuario, 'recuperar_password', code)) {
      throw Object.assign(new Error('Código inválido o vencido'), { status: 400 });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.query('UPDATE usuarios SET password_hash=?,sesion_version=sesion_version+1 WHERE id_usuario=?', [passwordHash, user.id_usuario]);
    await connection.query('UPDATE tokens_autenticacion SET usado_en=COALESCE(usado_en,NOW()) WHERE id_usuario=?', [user.id_usuario]);
    await connection.commit();
    res.json({ ok: true, mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.resetPasswordInfo = (req, res) => {
  res.send('<!doctype html><html><body style="font-family:Arial;text-align:center;padding:60px;background:#fffaf0"><h1 style="color:#278653">Recuperación solicitada</h1><p>Vuelve a Ciento Once e ingresa el código recibido junto con tu contraseña nueva.</p></body></html>');
};

exports.employeeLogin = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), pin = String(req.body.pin || '');
  const [[owner]] = await db.query('SELECT id_usuario,nombre,email,sesion_version FROM usuarios WHERE email=? AND activo=1 AND email_verificado=1', [email]);
  if (!owner) return res.status(401).json({ ok: false, mensaje: 'Negocio o PIN incorrectos' });
  const [employees] = await db.query('SELECT id_empleado,nombre,rol,pin_hash FROM empleados WHERE id_usuario=? AND activo=1', [owner.id_usuario]);
  const employee = (await Promise.all(employees.map(async item => (await bcrypt.compare(pin, item.pin_hash || '')) ? item : null))).find(Boolean);
  if (!employee) return res.status(401).json({ ok: false, mensaje: 'Negocio o PIN incorrectos' });
  const session = { ...owner, rol: employee.rol, id_empleado: employee.id_empleado, nombre_empleado: employee.nombre };
  res.json({ ok: true, mensaje: 'Acceso de empleado iniciado', data: { token: token(session), usuario: { id_usuario: owner.id_usuario, nombre: employee.nombre, email: owner.email, rol: employee.rol, id_empleado: employee.id_empleado } } });
};

exports.me = async (req, res) => {
  const [[user]] = await db.query('SELECT id_usuario,nombre,email FROM usuarios WHERE id_usuario=? AND activo=1 AND email_verificado=1', [req.usuario.id_usuario]);
  if (!user) return res.status(401).json({ ok: false, mensaje: 'Usuario no disponible' });
  res.json({ ok: true, data: { ...user, nombre: req.usuario.nombre_empleado || user.nombre, rol: req.usuario.rol || 'propietario', id_empleado: req.usuario.id_empleado || null } });
};
