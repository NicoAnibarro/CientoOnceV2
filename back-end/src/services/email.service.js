const nodemailer = require('nodemailer');

function configured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') !== 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function verifyConnection() {
  if (!configured()) throw new Error('La configuracion SMTP esta incompleta');
  await transporter().verify();
}

async function sendDiagnostic() {
  if (!configured()) throw new Error('La configuracion SMTP esta incompleta');
  return transporter().sendMail({
    from: process.env.MAIL_FROM || `Ciento Once <${process.env.SMTP_USER}>`,
    to: process.env.SMTP_USER,
    subject: 'Prueba de correo de Ciento Once',
    html: template(
      'Correo configurado correctamente',
      'Este mensaje confirma que la aplicacion puede enviar correos mediante Gmail.',
      'OK',
      process.env.PUBLIC_API_URL || 'https://ciento-once-v2-api.onrender.com/api',
      'Configuracion verificada'
    )
  });
}

function template(title, intro, code, actionUrl, actionLabel) {
  return `<!doctype html><html><body style="margin:0;background:#fffaf0;font-family:Arial,sans-serif;color:#17231b">
  <div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #dce8df;border-radius:18px;padding:30px">
    <div style="color:#278653;font-size:13px;font-weight:700;letter-spacing:1px">CIENTO ONCE</div>
    <h1 style="font-size:25px;margin:12px 0">${title}</h1>
    <p style="line-height:1.6">${intro}</p>
    <div style="font-size:30px;font-weight:800;letter-spacing:8px;text-align:center;background:#f3faf6;border-radius:14px;padding:18px;margin:22px 0">${code}</div>
    <p style="text-align:center"><a href="${actionUrl}" style="display:inline-block;background:#3CB371;color:#fff;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:700">${actionLabel}</a></p>
    <p style="font-size:13px;color:#66736b">El código y el enlace vencen en 30 minutos. Si no solicitaste esta acción, ignora este mensaje.</p>
  </div></body></html>`;
}

async function sendVerification({ email, nombre, code, token }) {
  const base = String(process.env.PUBLIC_API_URL || 'https://ciento-once-v2-api.onrender.com/api').replace(/\/$/, '');
  await transporter().sendMail({
    from: process.env.MAIL_FROM || `Ciento Once <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Verifica tu cuenta de Ciento Once',
    html: template('Verifica tu correo', `Hola ${nombre}. Confirma que este correo pertenece a tu cuenta.`, code, `${base}/auth/verify-email-link?token=${encodeURIComponent(token)}`, 'Verificar mi cuenta')
  });
}

async function sendPasswordReset({ email, nombre, code, token }) {
  const base = String(process.env.PUBLIC_API_URL || 'https://ciento-once-v2-api.onrender.com/api').replace(/\/$/, '');
  await transporter().sendMail({
    from: process.env.MAIL_FROM || `Ciento Once <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Recupera tu contraseña de Ciento Once',
    html: template('Recupera tu contraseña', `Hola ${nombre}. Usa este código dentro de la aplicación para crear una contraseña nueva.`, code, `${base}/auth/reset-password-info?token=${encodeURIComponent(token)}`, 'Abrir instrucciones')
  });
}

async function sendDeletionRequest({ email }) {
  const privacyEmail = process.env.PRIVACY_EMAIL || 'cientoonce2026@gmail.com';
  await transporter().sendMail({
    from: process.env.MAIL_FROM || `Ciento Once <${process.env.SMTP_USER}>`,
    to: privacyEmail,
    replyTo: email,
    subject: 'Solicitud externa de eliminación de cuenta',
    text: `Se recibió una solicitud de eliminación para la cuenta ${email}. Verifica la titularidad antes de borrar los datos.`
  });
}

module.exports = { configured, verifyConnection, sendDiagnostic, sendVerification, sendPasswordReset, sendDeletionRequest };
