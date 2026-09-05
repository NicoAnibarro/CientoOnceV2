const app = require('./app');
const emailService = require('./services/email.service');

const port = Number(process.env.PORT || 3000);
if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en .env');
  process.exit(1);
}

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Ciento Once API local actualizada en http://0.0.0.0:${port}`);
  console.log(`Version: 2026.09.05-production-privacy`);
  console.log(`Verificacion por correo: ${emailService.configured() ? 'ACTIVA' : 'INACTIVA'}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${port} ya esta ocupado por un backend anterior. Cierralo antes de continuar.`);
    process.exit(1);
  }
  throw error;
});
