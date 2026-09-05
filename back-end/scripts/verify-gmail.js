require('dotenv').config();
const emailService = require('../src/services/email.service');

emailService.verifyConnection()
  .then(() => {
    console.log('Conexion con Gmail verificada correctamente');
  })
  .catch(error => {
    console.error(`No se pudo validar Gmail: ${error.message}`);
    process.exit(1);
  });
