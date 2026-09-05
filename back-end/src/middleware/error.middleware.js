module.exports = (error, req, res, next) => {
  console.error(error);
  const status = error.status || 500;
  const development = process.env.NODE_ENV === 'development';
  res.status(status).json({
    ok: false,
    mensaje: error.status || development
      ? String(error.message || 'Ocurrio un error interno').slice(0, 500)
      : 'Ocurrio un error interno'
  });
};
