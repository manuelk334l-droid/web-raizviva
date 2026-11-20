const crypto = require('crypto');

function iguales(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// El panel envía la clave codificada (encodeURIComponent) para que tildes o símbolos
// no se dañen en el viaje. También se acepta la clave tal cual, por compatibilidad.
function candidatas(req) {
  const crudo = req.headers['x-admin-key'] || req.query.clave || '';
  const lista = [String(crudo)];
  try { lista.push(decodeURIComponent(crudo)); } catch { /* no estaba codificada */ }
  lista.push(Buffer.from(String(crudo), 'latin1').toString('utf8'));
  return lista.map(c => c.trim());
}

function claveValida(clave) {
  const esperada = String(process.env.ADMIN_KEY || '').trim();
  return esperada.length > 0 && iguales(clave, esperada);
}

function requiereAdmin(req, res, next) {
  const lista = candidatas(req);
  if (!lista[0]) {
    return res.status(401).json({ ok: false, mensaje: 'No autorizado: falta la clave. Cierra sesión y vuelve a entrar.' });
  }
  if (!lista.some(claveValida)) {
    return res.status(401).json({ ok: false, mensaje: 'No autorizado: la clave ya no es válida. Cierra sesión y vuelve a entrar.' });
  }
  next();
}

module.exports = { requiereAdmin, claveValida };
