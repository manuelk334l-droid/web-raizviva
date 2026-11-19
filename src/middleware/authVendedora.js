const { query } = require('../config/db');
const { verificarToken, huellaClave } = require('../services/vendedoraService');

// Valida el token y confirma en BD que la cuenta sigue activa y que la clave no cambió.
async function requiereVendedora(req, res, next) {
  try {
    const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    const datos = m ? verificarToken(m[1]) : null;
    if (!datos) return res.status(401).json({ ok: false, mensaje: 'Sesión no válida' });

    const { rows } = await query('SELECT id, activa, clave_hash FROM vendedoras WHERE id = $1', [datos.sub]);
    const v = rows[0];
    if (!v || !v.activa || huellaClave(v.clave_hash) !== datos.h) {
      return res.status(401).json({ ok: false, mensaje: 'Sesión expirada' });
    }

    req.vendedoraId = v.id;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requiereVendedora };
