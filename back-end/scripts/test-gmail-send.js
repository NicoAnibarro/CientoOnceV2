require('dotenv').config();
const emailService = require('../src/services/email.service');

emailService.sendDiagnostic()
  .then(info => {
    console.log(`Correo de prueba aceptado por Gmail: ${info.accepted?.length || 0} destinatario(s)`);
  })
  .catch(error => {
    console.error(`No se pudo enviar el correo: ${error.message}`);
    process.exit(1);
  });
