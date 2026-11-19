function requiereAdmin(req, res, next) {
  const clave = req.headers['x-admin-key'] || req.query.clave;
  if (clave !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, mensaje: 'No autorizado' });
  }
  next();
}

module.exports = { requiereAdmin };
